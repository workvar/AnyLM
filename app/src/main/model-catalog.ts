// Online + curated Ollama model catalog for the Models settings browser.
// Preloads a small popular set; live search filters a cached remote library.
import * as os from "os";
import * as ollama from "./ollama";

const CATALOG_URL = "https://ollama-models.zwz.workers.dev/";
const CACHE_TTL_MS = 30 * 60 * 1000;

export type CompatRating = "best" | "good" | "bad";

export interface ModelCatalogEntry {
  name: string;
  display: string;
  description: string;
  sizeLabel: string;
  sizeBytes: number | null;
  minRamGB: number;
  requirements: string;
  bestFor: string;
  compatibility: CompatRating;
  installed: boolean;
  popular?: boolean;
}

interface CuratedModel {
  name: string;
  display: string;
  description: string;
  sizeGB: number;
  minRamGB: number;
  bestFor: string;
}

interface RemoteModel {
  name: string;
  description: string;
  tags: string[];
}

// Curated popular models shown when the search box is empty.
const POPULAR: CuratedModel[] = [
  {
    name: "llama3.1:8b",
    display: "Llama 3.1 8B",
    description: "Meta’s strong general-purpose chat model.",
    sizeGB: 4.7,
    minRamGB: 8,
    bestFor: "Everyday chat & writing",
  },
  {
    name: "llama3.2:3b",
    display: "Llama 3.2 3B",
    description: "Small, fast Llama for light machines.",
    sizeGB: 2.0,
    minRamGB: 4,
    bestFor: "Quick replies on modest RAM",
  },
  {
    name: "qwen2.5-coder:7b",
    display: "Qwen2.5 Coder 7B",
    description: "Code-focused model with solid tool use.",
    sizeGB: 4.7,
    minRamGB: 8,
    bestFor: "Coding & debugging",
  },
  {
    name: "qwen2.5:14b",
    display: "Qwen2.5 14B",
    description: "Strong multilingual reasoning at mid size.",
    sizeGB: 9.0,
    minRamGB: 16,
    bestFor: "Analysis & long answers",
  },
  {
    name: "mistral:7b",
    display: "Mistral 7B",
    description: "Fast, efficient open chat model.",
    sizeGB: 4.1,
    minRamGB: 8,
    bestFor: "Speed & efficiency",
  },
  {
    name: "phi3:mini",
    display: "Phi-3 Mini",
    description: "Microsoft’s compact instruction model.",
    sizeGB: 2.3,
    minRamGB: 4,
    bestFor: "Lightweight assistants",
  },
  {
    name: "gemma2:9b",
    display: "Gemma 2 9B",
    description: "Google’s balanced open model.",
    sizeGB: 5.4,
    minRamGB: 10,
    bestFor: "General productivity",
  },
  {
    name: "deepseek-r1:8b",
    display: "DeepSeek R1 8B",
    description: "Reasoning-oriented distilled model.",
    sizeGB: 5.2,
    minRamGB: 10,
    bestFor: "Step-by-step reasoning",
  },
  {
    name: "codellama:7b",
    display: "Code Llama 7B",
    description: "Meta’s code generation model.",
    sizeGB: 3.8,
    minRamGB: 8,
    bestFor: "Code generation",
  },
  {
    name: "llava:7b",
    display: "LLaVA 7B",
    description: "Vision-language model for image chat.",
    sizeGB: 4.5,
    minRamGB: 8,
    bestFor: "Images & screenshots",
  },
  {
    name: "nomic-embed-text",
    display: "Nomic Embed Text",
    description: "Embedding model used for RAG / memory.",
    sizeGB: 0.27,
    minRamGB: 1,
    bestFor: "Search & memory embeddings",
  },
  {
    name: "tinyllama",
    display: "TinyLlama",
    description: "Very small model for smoke tests.",
    sizeGB: 0.64,
    minRamGB: 2,
    bestFor: "Testing & demos",
  },
];

let remoteCache: { at: number; models: RemoteModel[] } | null = null;

function totalRamGB(): number {
  return Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
}

function formatSize(bytes: number | null, sizeGB?: number): string {
  if (bytes != null && bytes > 0) {
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
    const mb = bytes / 1e6;
    return `${Math.round(mb)} MB`;
  }
  if (sizeGB != null && sizeGB > 0) {
    if (sizeGB < 1) return `~${Math.round(sizeGB * 1000)} MB`;
    return `~${sizeGB} GB`;
  }
  return "—";
}

function rateCompat(sysRam: number, minRam: number): CompatRating {
  if (sysRam >= minRam * 2) return "best";
  if (sysRam >= minRam) return "good";
  return "bad";
}

function bestForFromText(name: string, description: string): string {
  const hay = `${name} ${description}`.toLowerCase();
  if (/\bembed|embedding\b/.test(hay)) return "Embeddings & RAG";
  if (/\bvision|llava|image\b/.test(hay)) return "Images & vision";
  if (/\bcoder?|code\b/.test(hay)) return "Coding";
  if (/\breason|r1|think\b/.test(hay)) return "Reasoning";
  if (/\bmath\b/.test(hay)) return "Math & logic";
  if (/\bchat|instruct|assistant\b/.test(hay)) return "Chat & writing";
  if (/\btiny|mini|small|nano\b/.test(hay)) return "Lightweight use";
  return "General purpose";
}

/** Parse a parameter tag like "7b", "13b", "70b", "3.8b" → billions. */
function parseParamBillions(tag: string): number | null {
  const m = String(tag).toLowerCase().match(/^(\d+(?:\.\d+)?)[bm]$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (/m$/.test(tag.toLowerCase())) return n / 1000;
  return n;
}

function estimateFromTags(tags: string[]): { sizeGB: number; minRamGB: number; tag: string } {
  const prefer = ["8b", "7b", "9b", "3b", "4b", "1b", "12b", "14b", "13b", "2b", "latest"];
  let chosen: string | null = null;
  for (const p of prefer) {
    if (tags.includes(p)) {
      chosen = p;
      break;
    }
  }
  if (!chosen) {
    for (const t of tags || []) {
      if (parseParamBillions(t) != null) {
        chosen = t;
        break;
      }
    }
  }
  const bestB = chosen ? parseParamBillions(chosen) : null;
  const billions = bestB != null && bestB > 0 ? bestB : 7;
  const tag = chosen || tags?.[0] || "latest";
  // Rough Q4_K_M on-disk size ≈ 0.55 GB per billion params
  const sizeGB = Math.round(billions * 0.55 * 10) / 10;
  const minRamGB = Math.max(2, Math.ceil(sizeGB * 1.5));
  return { sizeGB, minRamGB, tag };
}

function estimateForName(pullName: string, tags: string[]): { sizeGB: number; minRamGB: number } {
  const tag = pullName.includes(":") ? pullName.split(":")[1] : null;
  if (tag) {
    const b = parseParamBillions(tag);
    if (b != null && b > 0) {
      const sizeGB = Math.round(b * 0.55 * 10) / 10;
      return { sizeGB, minRamGB: Math.max(2, Math.ceil(sizeGB * 1.5)) };
    }
  }
  const est = estimateFromTags(tags);
  return { sizeGB: est.sizeGB, minRamGB: est.minRamGB };
}

function pickPullName(base: string, tags: string[]): string {
  const prefer = ["latest", "8b", "7b", "9b", "3b", "4b", "14b", "instruct"];
  for (const p of prefer) {
    if (tags.includes(p)) return p === "latest" ? base : `${base}:${p}`;
  }
  const est = estimateFromTags(tags);
  return est.tag === "latest" ? base : `${base}:${est.tag}`;
}

async function loadRemote(): Promise<RemoteModel[]> {
  const now = Date.now();
  if (remoteCache && now - remoteCache.at < CACHE_TTL_MS) return remoteCache.models;
  try {
    const res = await fetch(CATALOG_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AnyLM/1.0 (Electron; model-catalog)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const data = (await res.json()) as RemoteModel[];
    const models = Array.isArray(data)
      ? data.filter((m) => m && typeof m.name === "string")
      : [];
    remoteCache = { at: now, models };
    return models;
  } catch (e) {
    console.warn("model catalog fetch failed:", (e as Error).message);
    return remoteCache?.models || [];
  }
}

/** Live search against ollama.com/search HTML (library links). */
async function searchOllamaSite(query: string): Promise<RemoteModel[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `https://ollama.com/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "AnyLM/1.0 (Electron; model-search)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`search ${res.status}`);
    const html = await res.text();
    const names = [...html.matchAll(/href="\/library\/([^"#?]+)"/g)].map((m) => m[1]);
    const unique = [...new Set(names)];
    return unique.map((name) => ({
      name,
      description: "Available on the Ollama library",
      tags: ["latest"],
    }));
  } catch (e) {
    console.warn("ollama.com search failed:", (e as Error).message);
    return [];
  }
}

function coveredByName(seenBases: Set<string>, name: string): boolean {
  return seenBases.has(name.split(":")[0]);
}

function enrich(
  partial: {
    name: string;
    display: string;
    description: string;
    sizeBytes: number | null;
    sizeGB?: number;
    minRamGB: number;
    bestFor: string;
    installed: boolean;
    popular?: boolean;
  },
  sysRam: number
): ModelCatalogEntry {
  const sizeLabel = formatSize(partial.sizeBytes, partial.sizeGB);
  return {
    name: partial.name,
    display: partial.display,
    description: partial.description,
    sizeLabel,
    sizeBytes: partial.sizeBytes,
    minRamGB: partial.minRamGB,
    requirements: `${partial.minRamGB}+ GB RAM`,
    bestFor: partial.bestFor,
    compatibility: rateCompat(sysRam, partial.minRamGB),
    installed: partial.installed,
    popular: partial.popular,
  };
}

function titleCase(name: string): string {
  const base = name.split(":")[0];
  return base
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function installedMap(): Promise<Map<string, number>> {
  const entries = await ollama.listModelEntries();
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.name, e.size);
  return map;
}

function isInstalledName(installed: Map<string, number>, name: string): boolean {
  if (installed.has(name)) return true;
  const base = name.split(":")[0];
  for (const key of installed.keys()) {
    if (key === base || key.startsWith(`${base}:`)) return true;
  }
  return false;
}

function installedSize(installed: Map<string, number>, name: string): number | null {
  if (installed.has(name)) return installed.get(name)!;
  const base = name.split(":")[0];
  for (const [key, size] of installed) {
    if (key === name || key === base || key.startsWith(`${name}:`) || key.startsWith(`${base}:`)) {
      return size;
    }
  }
  return null;
}

/** System RAM snapshot for the Models UI. */
export function systemInfo(): { totalRamGB: number } {
  return { totalRamGB: totalRamGB() };
}

/** Popular models only (preload). Installed-only extras are appended. */
export async function popularCatalog(): Promise<ModelCatalogEntry[]> {
  const sysRam = totalRamGB();
  const installed = await installedMap();
  const seenBases = new Set<string>();
  const out: ModelCatalogEntry[] = [];

  for (const m of POPULAR) {
    seenBases.add(m.name.split(":")[0]);
    out.push(
      enrich(
        {
          name: m.name,
          display: m.display,
          description: m.description,
          sizeBytes: installedSize(installed, m.name),
          sizeGB: m.sizeGB,
          minRamGB: m.minRamGB,
          bestFor: m.bestFor,
          installed: isInstalledName(installed, m.name),
          popular: true,
        },
        sysRam
      )
    );
  }

  // Installed models not already covered by the popular list
  for (const [name, size] of installed) {
    if (coveredByName(seenBases, name)) continue;
    seenBases.add(name.split(":")[0]);
    const sizeGB = size / 1024 ** 3;
    const minRamGB = Math.max(2, Math.ceil(sizeGB * 1.5));
    out.unshift(
      enrich(
        {
          name,
          display: name,
          description: "Installed on this device",
          sizeBytes: size,
          sizeGB,
          minRamGB,
          bestFor: bestForFromText(name, ""),
          installed: true,
        },
        sysRam
      )
    );
  }

  return out;
}

/**
 * Live search across the remote library (+ popular). Empty query returns popular.
 * Filters installed-only when `installedOnly` is true.
 */
export async function searchCatalog(
  query: string,
  opts: { installedOnly?: boolean } = {}
): Promise<ModelCatalogEntry[]> {
  const q = (query || "").trim().toLowerCase();
  const sysRam = totalRamGB();
  const installed = await installedMap();

  if (!q) {
    const popular = await popularCatalog();
    return opts.installedOnly ? popular.filter((m) => m.installed) : popular;
  }

  if (opts.installedOnly) {
    const out: ModelCatalogEntry[] = [];
    for (const [name, size] of installed) {
      if (!name.toLowerCase().includes(q)) continue;
      const sizeGB = size / 1024 ** 3;
      const minRamGB = Math.max(2, Math.ceil(sizeGB * 1.5));
      const curated = POPULAR.find((p) => p.name === name || name.startsWith(`${p.name.split(":")[0]}:`));
      out.push(
        enrich(
          {
            name,
            display: curated?.display || name,
            description: curated?.description || "Installed on this device",
            sizeBytes: size,
            sizeGB: curated?.sizeGB ?? sizeGB,
            minRamGB: curated?.minRamGB ?? minRamGB,
            bestFor: curated?.bestFor || bestForFromText(name, ""),
            installed: true,
          },
          sysRam
        )
      );
    }
    return out;
  }

  const remote = await loadRemote();
  const site = await searchOllamaSite(q);
  const byName = new Map<string, RemoteModel>();
  for (const m of [...remote, ...site]) {
    if (!byName.has(m.name)) byName.set(m.name, m);
  }
  const hits: ModelCatalogEntry[] = [];
  const seenBases = new Set<string>();

  // Match curated popular first (better metadata)
  for (const m of POPULAR) {
    const hay = `${m.name} ${m.display} ${m.description} ${m.bestFor}`.toLowerCase();
    if (!hay.includes(q)) continue;
    seenBases.add(m.name.split(":")[0]);
    hits.push(
      enrich(
        {
          name: m.name,
          display: m.display,
          description: m.description,
          sizeBytes: installedSize(installed, m.name),
          sizeGB: m.sizeGB,
          minRamGB: m.minRamGB,
          bestFor: m.bestFor,
          installed: isInstalledName(installed, m.name),
          popular: true,
        },
        sysRam
      )
    );
  }

  for (const m of byName.values()) {
    const hay = `${m.name} ${m.description || ""}`.toLowerCase();
    if (!hay.includes(q) && !m.name.toLowerCase().includes(q)) continue;
    if (coveredByName(seenBases, m.name)) continue;
    seenBases.add(m.name.split(":")[0]);
    const pullName = pickPullName(m.name, m.tags || []);
    const est = estimateForName(pullName, m.tags || []);
    hits.push(
      enrich(
        {
          name: pullName,
          display: titleCase(m.name),
          description: m.description || "Available on the Ollama library",
          sizeBytes: installedSize(installed, pullName),
          sizeGB: est.sizeGB,
          minRamGB: est.minRamGB,
          bestFor: bestForFromText(m.name, m.description || ""),
          installed: isInstalledName(installed, pullName),
        },
        sysRam
      )
    );
    if (hits.length >= 60) break;
  }

  // Also surface installed names that match but aren't in remote
  for (const [name, size] of installed) {
    if (!name.toLowerCase().includes(q)) continue;
    if (hits.some((h) => h.name === name || coveredByName(seenBases, name))) continue;
    const sizeGB = size / 1024 ** 3;
    hits.unshift(
      enrich(
        {
          name,
          display: name,
          description: "Installed on this device",
          sizeBytes: size,
          sizeGB,
          minRamGB: Math.max(2, Math.ceil(sizeGB * 1.5)),
          bestFor: bestForFromText(name, ""),
          installed: true,
        },
        sysRam
      )
    );
  }

  return hits;
}

/** Warm the remote catalog cache (fire-and-forget on app start / models open). */
export function preloadRemote(): void {
  void loadRemote();
}
