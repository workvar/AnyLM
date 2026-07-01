// Manages the embedding model used for RAG (chunking + retrieval).
// Centralizes the model name, installation check, system requirements,
// and the download (pull) with persistent progress state.
const os = require("os");
const ollama = require("./ollama");

const EMBED_MODEL = process.env.LLMETER_EMBED_MODEL || "nomic-embed-text";
const REGISTRY = process.env.OLLAMA_REGISTRY || "https://registry.ollama.ai";

// Fallbacks used if the registry can't be reached (verified Jun 2026:
// nomic-embed-text is a 137M F16 model, ~274 MB on disk).
const FALLBACK = { sizeBytes: 274290656, paramLabel: "137M", quant: "F16" };

// Parse "namespace/model:tag" → { namespace, model, tag }. Bare names use the
// public library namespace and the "latest" tag.
function parseRef(ref) {
  let [path, tag = "latest"] = ref.split(":");
  const parts = path.split("/");
  const model = parts.pop();
  const namespace = parts.pop() || "library";
  return { namespace, model, tag };
}

function gb(bytes) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

// Decimal MB, matching how ollama.com displays download sizes.
function mb(bytes) {
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
    const manifest = await mRes.json();
    const sizeBytes = (manifest.layers || [])
      .filter((l) => (l.mediaType || "").endsWith(".image.model"))
      .reduce((n, l) => n + (l.size || 0), 0);

    let paramLabel = FALLBACK.paramLabel;
    let quant = FALLBACK.quant;
    try {
      const cfg = manifest.config && manifest.config.digest;
      if (cfg) {
        const cRes = await fetch(`${base}/blobs/${cfg}`);
        if (cRes.ok) {
          const c = await cRes.json();
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
function minRamGB(sizeBytes) {
  return Math.max(1, Math.ceil((sizeBytes * 1.5) / 1024 ** 3));
}

// Download progress that outlives the modal: the renderer can re-read it.
let state = { active: false, percent: 0, status: "", error: null, done: false };

function getState() {
  return { ...state };
}

// True if the embedding model is already pulled into Ollama.
async function isInstalled() {
  try {
    const models = await ollama.listModels();
    return models.some((m) => m === EMBED_MODEL || m.startsWith(`${EMBED_MODEL}:`));
  } catch {
    return false;
  }
}

// Live download size + requirements, fetched from the Ollama registry.
async function requirements() {
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
async function install(onProgress = () => {}) {
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
    state = { active: false, percent: state.percent, status: "error", error: e.message, done: false };
    emit();
    return { ok: false, error: e.message };
  }
}

module.exports = { EMBED_MODEL, isInstalled, requirements, install, getState };
