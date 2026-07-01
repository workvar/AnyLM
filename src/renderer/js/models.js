// Models browser: browse, search, download, and manage Ollama models
import { el, node } from "./dom.js";
import { state } from "./state.js";

// All available models (from popular registries)
const POPULAR_MODELS = [
  // LLMs
  { name: "llama2", display: "Llama 2", description: "Meta's open-source LLM", size: "3.8GB" },
  { name: "llama2:7b", display: "Llama 2 (7B)", description: "Lightweight version", size: "3.8GB" },
  { name: "llama2:13b", display: "Llama 2 (13B)", description: "Larger version", size: "7.4GB" },
  { name: "mistral", display: "Mistral", description: "Fast & efficient model", size: "4.1GB" },
  { name: "neural-chat", display: "Neural Chat", description: "Intel optimized chat model", size: "4.8GB" },
  { name: "dolphin-mixtral", display: "Dolphin Mixtral", description: "Fine-tuned Mixtral", size: "26GB" },
  { name: "orca-mini", display: "Orca Mini", description: "Small instruction-tuned model", size: "1.7GB" },
  { name: "zephyr", display: "Zephyr", description: "Chat-optimized model", size: "3.8GB" },
  
  // Code models
  { name: "codegemma", display: "CodeGemma", description: "Code generation model", size: "2.6GB" },
  { name: "codellama", display: "Code Llama", description: "Code generation focused", size: "3.8GB" },
  
  // Other models
  { name: "command-light", display: "Command Light", description: "Cohere's lightweight model", size: "1.5GB" },
  { name: "phi", display: "Phi", description: "Microsoft's efficient model", size: "1.4GB" },
];

let allModels = [];
let installedModels = new Set();
let downloadingModels = new Set();

export async function loadModels() {
  try {
    const installed = await window.api.listModels();
    installedModels = new Set(installed);
    state.models = installed;
    render();
  } catch (e) {
    console.error("Failed to load models:", e);
  }
}

export function openModelsView() {
  loadModels();
}

export function render() {
  const query = el("models-search")?.value || "";
  const filter = state.modelsFilter || "all";
  
  const filtered = POPULAR_MODELS.filter(m => {
    const matchesQuery = !query || m.display.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase());
    const isInstalled = installedModels.has(m.name);
    const matchesFilter = filter === "all" || (filter === "installed" && isInstalled);
    return matchesQuery && matchesFilter;
  });

  const container = el("models-container");
  container.innerHTML = "";

  if (!filtered.length) {
    container.appendChild(node("div", "grid-empty", 
      filter === "installed" ? "No installed models" : "No models found"));
    return;
  }

  for (const model of filtered) {
    const card = renderModelCard(model);
    container.appendChild(card);
  }
}

function renderModelCard(model) {
  const card = node("div", "model-card");
  const isInstalled = installedModels.has(model.name);
  const isDownloading = downloadingModels.has(model.name);

  // Header with name
  const header = node("div", "model-header");
  header.appendChild(node("div", "model-name", model.display));
  if (isInstalled) {
    header.appendChild(node("span", "model-badge installed", "✓ Installed"));
  }
  card.appendChild(header);

  // Description
  card.appendChild(node("div", "model-desc", model.description));

  // Size and meta
  const meta = node("div", "model-meta");
  meta.appendChild(node("span", "", `~${model.size}`));
  card.appendChild(meta);

  // Progress bar (if downloading)
  if (isDownloading) {
    const progress = node("div", "model-progress");
    const bar = node("div", "progress-bar");
    const barFill = node("div", "progress-fill");
    barFill.id = `progress-${model.name}`;
    barFill.style.width = "0%";
    bar.appendChild(barFill);
    progress.appendChild(bar);
    const statusText = node("div", "model-status", "Downloading...");
    statusText.id = `status-${model.name}`;
    progress.appendChild(statusText);
    card.appendChild(progress);
  }

  // Actions
  const actions = node("div", "model-actions");
  
  if (isDownloading) {
    const cancelBtn = node("button", "ghost small", "Cancel");
    cancelBtn.onclick = () => cancelDownload(model.name);
    actions.appendChild(cancelBtn);
  } else if (isInstalled) {
    const deleteBtn = node("button", "danger small", "Delete");
    deleteBtn.onclick = () => deleteModel(model.name);
    actions.appendChild(deleteBtn);
  } else {
    const downloadBtn = node("button", "primary small", "Download");
    downloadBtn.onclick = () => downloadModel(model.name);
    actions.appendChild(downloadBtn);
  }

  card.appendChild(actions);
  return card;
}

async function downloadModel(modelName) {
  downloadingModels.add(modelName);
  render();

  try {
    await window.api.pullModel(modelName, (progress) => {
      const fill = document.getElementById(`progress-${modelName}`);
      const status = document.getElementById(`status-${modelName}`);
      if (fill && progress.percent !== null) {
        fill.style.width = `${progress.percent}%`;
      }
      if (status) {
        status.textContent = `${progress.status || 'Downloading'}${progress.percent !== null ? ` (${progress.percent}%)` : ''}`;
      }
    });

    // Refresh model list
    installedModels.add(modelName);
    downloadingModels.delete(modelName);
    await loadModels();
  } catch (e) {
    console.error(`Failed to download ${modelName}:`, e);
    downloadingModels.delete(modelName);
    render();
    alert(`Failed to download ${modelName}: ${e.message}`);
  }
}

function cancelDownload(modelName) {
  downloadingModels.delete(modelName);
  window.api.cancelPullModel(modelName).catch(console.error);
  render();
}

async function deleteModel(modelName) {
  const confirmed = confirm(`Delete ${modelName}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await window.api.deleteModel(modelName);
    installedModels.delete(modelName);
    await loadModels();
  } catch (e) {
    console.error(`Failed to delete ${modelName}:`, e);
    alert(`Failed to delete ${modelName}: ${e.message}`);
  }
}

export function bindEvents() {
  const searchInput = el("models-search");
  if (searchInput) {
    searchInput.oninput = () => {
      state.modelsQuery = searchInput.value;
      render();
    };
  }

  const filterButtons = document.querySelectorAll("#models-filter button");
  for (const btn of filterButtons) {
    btn.onclick = () => {
      state.modelsFilter = btn.dataset.filter;
      for (const b of filterButtons) {
        b.classList.toggle("active", b === btn);
      }
      render();
    };
  }
}
