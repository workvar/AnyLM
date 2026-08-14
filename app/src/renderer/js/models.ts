// Models browser: browse, live-search, download, and manage Ollama models.
import { el, node, qsa } from "./dom.js";
import { state } from "./state.js";
import { setModelDropdown, getSelectedModel } from "./dropdown.js";

let rows: ModelCatalogEntry[] = [];
let downloadingModels = new Set<string>();
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;
let systemRamGB: number | null = null;

export async function loadModels() {
  try {
    const installed = await window.api.listModels();
    state.models = installed;
    if (systemRamGB == null) {
      const sys = await window.api.modelsSystem();
      systemRamGB = sys.totalRamGB;
      const hint = el("models-system-hint");
      if (hint) hint.textContent = `This device: ${sys.totalRamGB} GB RAM`;
    }
    await refreshCatalog();
  } catch (e) {
    console.error("Failed to load models:", e);
  }
}

export function openModelsView() {
  loadModels();
}

async function refreshCatalog() {
  const query = (el("models-search")?.value || state.modelsQuery || "").trim();
  const installedOnly = state.modelsFilter === "installed";
  const seq = ++searchSeq;
  try {
    const next = query
      ? await window.api.modelsSearch(query, installedOnly)
      : installedOnly
        ? (await window.api.modelsCatalog()).filter((m) => m.installed)
        : await window.api.modelsCatalog();
    if (seq !== searchSeq) return;
    rows = next;
    render();
  } catch (e) {
    console.error("Model catalog failed:", e);
    if (seq !== searchSeq) return;
    rows = [];
    render();
  }
}

export function render() {
  const container = el("models-container");
  if (!container) return;
  const layout = state.modelsLayout === "grid" ? "grid" : "list";
  container.className = layout === "grid" ? "models-grid" : "models-list";
  container.innerHTML = "";

  if (!rows.length) {
    const q = (el("models-search")?.value || "").trim();
    container.appendChild(
      node(
        "div",
        "grid-empty",
        state.modelsFilter === "installed"
          ? "No installed models"
          : q
            ? "No models match that search"
            : "No models found"
      )
    );
    return;
  }

  for (const model of rows) {
    container.appendChild(renderModelCard(model, layout));
  }
}

function compatLabel(rating: ModelCompatRating): string {
  if (rating === "best") return "Best";
  if (rating === "good") return "Good";
  return "Bad";
}

function renderModelCard(model: ModelCatalogEntry, layout: "list" | "grid") {
  const card = node("div", layout === "grid" ? "model-card" : "model-row");
  const isInstalled = model.installed;
  const isDownloading = downloadingModels.has(model.name);

  const main = node("div", "model-main");
  const header = node("div", "model-header");
  header.appendChild(node("div", "model-name", model.display || model.name));
  if (isInstalled) header.appendChild(node("span", "model-badge installed", "Installed"));
  if (model.name !== model.display) {
    header.appendChild(node("span", "model-tag", model.name));
  }
  main.appendChild(header);

  if (model.description) {
    main.appendChild(node("div", "model-desc", model.description));
  }

  const meta = node("div", "model-meta");
  meta.appendChild(pill("Size", model.sizeLabel));
  meta.appendChild(pill("Needs", model.requirements));
  const compat = node(
    "span",
    `model-compat compat-${model.compatibility}`,
    `My system: ${compatLabel(model.compatibility)}`
  );
  meta.appendChild(compat);
  meta.appendChild(node("span", "model-best", `Best for: ${model.bestFor}`));
  main.appendChild(meta);

  if (isDownloading) {
    const progress = node("div", "model-progress");
    const bar = node("div", "progress-bar");
    const barFill = node("div", "progress-fill");
    barFill.id = `progress-${cssId(model.name)}`;
    barFill.style.width = "0%";
    bar.appendChild(barFill);
    progress.appendChild(bar);
    const statusText = node("div", "model-status", "Downloading…");
    statusText.id = `status-${cssId(model.name)}`;
    progress.appendChild(statusText);
    main.appendChild(progress);
  }

  card.appendChild(main);

  const actions = node("div", "model-actions");
  if (isDownloading) {
    const cancelBtn = node("button", "ghost small", "Cancel");
    cancelBtn.onclick = () => cancelDownload(model.name);
    actions.appendChild(cancelBtn);
  } else if (isInstalled) {
    const deleteBtn = node("button", "danger small", "Remove");
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

function pill(label: string, value: string) {
  const span = node("span", "model-pill", "");
  span.appendChild(node("em", "", label));
  span.appendChild(document.createTextNode(` ${value}`));
  return span;
}

function cssId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function downloadModel(modelName: string) {
  downloadingModels.add(modelName);
  render();

  try {
    await window.api.pullModel(modelName, (progress) => {
      const fill = document.getElementById(`progress-${cssId(modelName)}`);
      const status = document.getElementById(`status-${cssId(modelName)}`);
      if (fill && progress.percent !== null) {
        fill.style.width = `${progress.percent}%`;
      }
      if (status) {
        status.textContent = `${progress.status || "Downloading"}${
          progress.percent !== null ? ` (${progress.percent}%)` : ""
        }`;
      }
    });

    downloadingModels.delete(modelName);
    state.models = await window.api.listModels();
    setModelDropdown(state.models, getSelectedModel() || state.models[0]);
    await refreshCatalog();
  } catch (e) {
    console.error(`Failed to download ${modelName}:`, e);
    downloadingModels.delete(modelName);
    render();
    alert(`Failed to download ${modelName}: ${(e as Error).message}`);
  }
}

function cancelDownload(modelName: string) {
  downloadingModels.delete(modelName);
  window.api.cancelPullModel(modelName);
  render();
}

async function deleteModel(modelName: string) {
  const confirmed = confirm(`Remove ${modelName}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await window.api.deleteModel(modelName);
    state.models = await window.api.listModels();
    const current = getSelectedModel();
    const nextSelected = state.models.includes(current) ? current : state.models[0];
    setModelDropdown(state.models, nextSelected);
    await refreshCatalog();
  } catch (e) {
    console.error(`Failed to remove ${modelName}:`, e);
    alert(`Failed to remove ${modelName}: ${(e as Error).message}`);
  }
}

export function bindEvents() {
  const searchInput = el("models-search");
  if (searchInput) {
    searchInput.oninput = () => {
      state.modelsQuery = searchInput.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        void refreshCatalog();
      }, 280);
    };
  }

  const filterButtons = qsa("#models-filter button");
  for (const btn of filterButtons) {
    btn.onclick = () => {
      state.modelsFilter = btn.dataset.filter;
      for (const b of filterButtons) {
        b.classList.toggle("active", b === btn);
      }
      void refreshCatalog();
    };
  }

  const layoutButtons = qsa("#models-layout button");
  for (const btn of layoutButtons) {
    btn.onclick = () => {
      state.modelsLayout = btn.dataset.layout === "grid" ? "grid" : "list";
      for (const b of layoutButtons) {
        const on = b === btn;
        b.classList.toggle("active", on);
        // aria-pressed must track the visual state, not just the class.
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      render();
    };
  }
}
