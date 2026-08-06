// Manages the embedding model used for RAG (chunking + retrieval).
// Centralizes the model name, installation check, system requirements,
// and the download (pull) with persistent progress state.
import * as os from "os";
import * as ollama from "./ollama";
import { env } from "./env";

const EMBED_MODEL = env.embedModel;
const REGISTRY = process.env.OLLAMA_REGISTRY || env.ollamaRegistry;

// Fallbacks used if the registry can't be reached (verified Jun 2026:
// nomic-embed-text is a 137M F16 model, ~274 MB on disk).
const FALLBACK = { sizeBytes: 274290656, paramLabel: "137M", quant: "F16" };

// Parse "namespace/model:tag" → { namespace, model, tag }. Bare names use the
// public library namespace and the "latest" tag.
function parseRef(ref: string): { namespace: string; model: string; tag: string } {
  const [path, tag = "latest"] = ref.split(":");
  const parts = path.split("/");
  const model = parts.pop()!;
  const namespace = parts.pop() || "library";
  return { namespace, model, tag };
}

function gb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

// Decimal MB, matching how ollama.com displays download sizes.
function mb(bytes: number): number {
  return Math.round(bytes / 1e6);
}

// Fetch the model's real download size + metadata from the Ollama registry.
// Returns { sizeBytes, paramLabel, quant }; falls back to known values offline.
async function fetchModelMeta() {
  const { namespace, model, tag } = parseRef(EMBED_MODEL);
  const base = `${REGISTRY}/v2/${namespace}/${model}`;
  try {
    const mRes = await fetch(`${base}/manifests/${tag}`);
    if (!mRes.ok) throw new Error(`manifest ${mRes.status}`);
    const manifest = ((await mRes.json()) as any);
    const sizeBytes = (manifest.layers || [])
      .filter((l: any) => (l.mediaType || "").endsWith(".image.model"))
      .reduce((n: number, l: any) => n + (l.size || 0), 0);

    let paramLabel = FALLBACK.paramLabel;
    let quant = FALLBACK.quant;
    try {
      const cfg = manifest.config && manifest.config.digest;
      if (cfg) {
        const cRes = await fetch(`${base}/blobs/${cfg}`);
        if (cRes.ok) {
          const c = ((await cRes.json()) as any);
          if (c.model_type) paramLabel = c.model_type;
          if (c.file_type) quant = c.file_type;
        }
      }
    } catch {}

    return { sizeBytes: sizeBytes || FALLBACK.sizeBytes, paramLabel, quant };
  } catch {
    return { ...FALLBACK };
  }
}

// Memory headroom to load the model: roughly its size plus working overhead,
// floored at 1 GB. Derived from the real download size.
function minRamGB(sizeBytes: number): number {
  return Math.max(1, Math.ceil((sizeBytes * 1.5) / 1024 ** 3));
}

// Download progress that outlives the modal: the renderer can re-read it.
let state: EmbedState = { active: false, percent: 0, status: "", error: null, done: false };

function getState(): EmbedState {
  return { ...state };
}

// True if the embedding model is already pulled into Ollama.
async function isInstalled(): Promise<boolean> {
  try {
    const models = await ollama.listModels();
    return models.some((m) => m === EMBED_MODEL || m.startsWith(`${EMBED_MODEL}:`));
  } catch {
    return false;
  }
}

// Live download size + requirements, fetched from the Ollama registry.
async function requirements(): Promise<EmbedRequirements> {
  const meta = await fetchModelMeta();
  const minRam = minRamGB(meta.sizeBytes);
  const totalRamGB = gb(os.totalmem());
  const freeDiskOk = true; // disk space is checked by Ollama during pull
  const ok = totalRamGB >= minRam;
  return {
    model: EMBED_MODEL,
    sizeLabel: `${mb(meta.sizeBytes)} MB`,
    sizeBytes: meta.sizeBytes,
    paramLabel: meta.paramLabel,
    quant: meta.quant,
    minRamGB: minRam,
    totalRamGB,
    freeDiskOk,
    ok,
    reason: ok ? null : `Needs at least ${minRam} GB RAM (this machine has ${totalRamGB} GB).`,
  };
}

// Pull the model. onProgress({ percent, status }) fires as it streams.
// Resolves { ok } and keeps state so a dismissed modal can reattach.
async function install(
  onProgress: (s: EmbedState) => void = () => {}
): Promise<{ ok: boolean; error?: string }> {
  if (state.active) return { ok: false, error: "Already downloading" };
  state = { active: true, percent: 0, status: "starting", error: null, done: false };
  const emit = () => onProgress(getState());
  emit();
  try {
    await ollama.pull(EMBED_MODEL, ({ percent, status }) => {
      if (percent != null) state.percent = percent;
      if (status) state.status = status;
      emit();
    });
    state = { active: false, percent: 100, status: "complete", error: null, done: true };
    emit();
    return { ok: true };
  } catch (e) {
    const message = (e as Error).message;
    state = { active: false, percent: state.percent, status: "error", error: message, done: false };
    emit();
    return { ok: false, error: message };
  }
}

export { EMBED_MODEL, isInstalled, requirements, install, getState };

