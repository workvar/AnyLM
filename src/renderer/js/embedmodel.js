// Embedding-model setup: status, manual check, download with confirmation,
// and a persistent progress bar (the confirm/progress modal can be dismissed
// while the download continues in the background).
import { el } from "./dom.js";

let installed = false;
let downloading = false;

function setStatus(text) {
  el("embed-status").textContent = text;
}

function showProgress(percent, label) {
  el("embed-progress-row").classList.remove("hidden");
  el("embed-bar").style.width = `${percent || 0}%`;
  el("embed-progress-label").textContent = label;
}

function hideProgress() {
  el("embed-progress-row").classList.add("hidden");
}

// Reflect installed/missing/downloading in the settings row.
function paint() {
  if (downloading) {
    setStatus("Downloading…");
    el("embed-download").classList.add("hidden");
    return;
  }
  if (installed) {
    setStatus("Installed");
    el("embed-download").classList.add("hidden");
    hideProgress();
  } else {
    setStatus("Not installed");
    el("embed-download").classList.remove("hidden");
  }
}

async function refresh() {
  setStatus("Checking…");
  try {
    const s = await window.api.embedStatus();
    installed = s.installed;
  } catch {
    installed = false;
  }
  paint();
  return installed;
}

// Track progress events even when the modal is closed.
function handleProgress(s) {
  if (s.error) {
    downloading = false;
    showProgress(s.percent, `Error: ${s.error}`);
    paint();
    return;
  }
  if (s.done) {
    downloading = false;
    showProgress(100, "Download complete");
    installed = true;
    paint();
    return;
  }
  downloading = s.active;
  showProgress(s.percent, `Downloading ${s.status || ""}… ${s.percent || 0}%`);
}

function startDownload() {
  downloading = true;
  paint();
  showProgress(0, "Starting…");
  // Progress arrives via the global onEmbedProgress listener (set in init).
  window.api.installEmbed(() => {});
}

async function openConfirm() {
  el("ec-size").textContent = "Fetching from Ollama…";
  el("ec-req").textContent = "—";
  el("embed-confirm").classList.remove("hidden");
  const r = await window.api.embedRequirements();
  const detail = [r.paramLabel, r.quant].filter(Boolean).join(" · ");
  el("ec-model").textContent = detail ? `${r.model} (${detail})` : r.model;
  el("ec-size").textContent = r.sizeLabel;
  el("ec-req").textContent = `${r.minRamGB} GB RAM minimum · ${r.totalRamGB} GB available`;
  const warn = el("ec-warn");
  if (!r.ok) {
    warn.textContent = r.reason;
    warn.classList.remove("hidden");
  } else {
    warn.classList.add("hidden");
  }
}

function closeConfirm() {
  el("embed-confirm").classList.add("hidden");
}

function bind() {
  el("embed-check").onclick = refresh;
  el("embed-download").onclick = openConfirm;
  el("embed-confirm-cancel").onclick = closeConfirm;
  el("embed-confirm").onclick = (e) => {
    if (e.target.id === "embed-confirm") closeConfirm();
  };
  el("embed-confirm-start").onclick = () => {
    closeConfirm();
    startDownload();
  };
}

// Wire up listeners and reflect any in-flight download from a prior view.
export async function initEmbedModel() {
  bind();
  // Listen globally so progress survives closing the settings modal.
  window.api.onEmbedProgress(handleProgress);
  const st = await window.api.embedState().catch(() => null);
  if (st && st.active) {
    downloading = true;
    handleProgress(st);
  }
  await refresh();
}

// On launch: if the model is missing and the user hasn't declined, offer to install.
export async function runEmbedLaunchFlow(settings) {
  const ok = await refresh();
  if (ok || settings.embedInstallDeclined === true) return;

  el("embed-prompt").classList.remove("hidden");
  el("embed-prompt-no").onclick = async () => {
    el("embed-prompt").classList.add("hidden");
    await window.api.setSettings({ embedInstallDeclined: true });
  };
  el("embed-prompt-yes").onclick = async () => {
    el("embed-prompt").classList.add("hidden");
    await window.api.setSettings({ embedInstallDeclined: false });
    await openConfirm();
  };
}
