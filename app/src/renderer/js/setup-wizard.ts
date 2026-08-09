// First-run setup wizard: bundled services, Ollama, optional embed model, prefs.
import { el } from "./dom.js";

type WizardStep = "welcome" | "ollama" | "embed" | "prefs" | "done";

const STEPS: WizardStep[] = ["welcome", "ollama", "embed", "prefs", "done"];

function captureProduct(event: string, properties?: Record<string, unknown>): void {
  void window.api.analyticsCapture({ event, category: "productUsage", properties }).catch(() => {});
}

function trackWizardStep(step: WizardStep): void {
  captureProduct("setup_wizard_step", { step });
}

const DEP_LABELS: Record<StartupDepStatus["id"], string> = {
  chroma: "Project memory",
  graph: "Knowledge graph",
  ollama: "Local models (Ollama)",
};

const OLLAMA_COPY: Record<
  Exclude<OllamaSetupState, "running">,
  { title: string; body: string; primary: string }
> = {
  missing: {
    title: "Install Ollama",
    body: "Ollama runs AI models on your device. Download it from ollama.com, then return here — we'll detect it automatically.",
    primary: "Open download page",
  },
  installed: {
    title: "Start Ollama",
    body: "Ollama is installed but not running. Start it to chat with local models.",
    primary: "Start Ollama",
  },
};

let resolveFlow: (() => void) | null = null;
let ollamaState: OllamaSetupState = "missing";
let installPoll: ReturnType<typeof setInterval> | null = null;
let onOllamaReady: (() => void) | undefined;

export function shouldRunSetupWizard(settings: AppSettings): boolean {
  return settings.setupWizardCompleted !== true;
}

function finishFlow() {
  const resolve = resolveFlow;
  resolveFlow = null;
  resolve?.();
}

function showWizard() {
  el("setup-wizard").classList.remove("hidden");
}

function hideWizard() {
  el("setup-wizard").classList.add("hidden");
}

function showStep(step: WizardStep) {
  for (const id of STEPS) {
    el(`setup-step-${id}`).classList.toggle("hidden", id !== step);
  }
  const idx = STEPS.indexOf(step) + 1;
  el("setup-wizard-progress").textContent = `Step ${idx} of ${STEPS.length}`;
}

function stopInstallPolling() {
  if (installPoll !== null) {
    clearInterval(installPoll);
    installPoll = null;
  }
}

function setOllamaError(message: string) {
  const node = el("setup-ollama-error");
  if (!message) {
    node.textContent = "";
    node.classList.add("hidden");
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function setOllamaBusy(busy: boolean) {
  el("setup-ollama-primary").disabled = busy;
}

function paintOllama(state: OllamaSetupState) {
  ollamaState = state;
  const running = state === "running";
  el("setup-ollama-running").classList.toggle("hidden", !running);
  el("setup-ollama-action").classList.toggle("hidden", running);
  el("setup-ollama-next").classList.toggle("hidden", !running);
  if (running) {
    setOllamaError("");
    setOllamaBusy(false);
    stopInstallPolling();
    return;
  }
  const copy = OLLAMA_COPY[state];
  el("setup-ollama-title").textContent = copy.title;
  el("setup-ollama-body").textContent = copy.body;
  el("setup-ollama-primary").textContent = copy.primary;
  setOllamaError("");
  setOllamaBusy(false);
}

async function refreshOllamaStep(): Promise<boolean> {
  try {
    const probe = await window.api.ollamaProbe();
    paintOllama(probe.state);
    return probe.state === "running";
  } catch {
    paintOllama("missing");
    return false;
  }
}

function startInstallPolling() {
  stopInstallPolling();
  installPoll = setInterval(async () => {
    if (await refreshOllamaStep()) {
      stopInstallPolling();
      onOllamaReady?.();
    }
  }, 2000);
}

function renderDepsList(report: StartupDepsReport) {
  const list = el("setup-deps-list");
  list.replaceChildren();
  for (const dep of report.deps) {
    const item = document.createElement("li");
    item.className = `setup-dep ${dep.ok ? "ok" : dep.kind === "bundled" ? "warn" : "pending"}`;
    const icon = document.createElement("span");
    icon.className = "setup-dep-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = dep.ok ? "✓" : dep.kind === "bundled" ? "!" : "○";
    const label = document.createElement("span");
    label.className = "setup-dep-label";
    label.textContent = DEP_LABELS[dep.id];
    const detail = document.createElement("small");
    detail.className = "setup-dep-detail";
    detail.textContent = dep.message;
    item.append(icon, label, detail);
    list.appendChild(item);
  }
}

async function loadWelcomeStep() {
  showStep("welcome");
  try {
    const report = await window.api.startupDeps();
    renderDepsList(report);
    const bundledOk = report.deps.filter((d) => d.kind === "bundled").every((d) => d.ok);
    el("setup-bundled-retry").classList.toggle("hidden", bundledOk);
  } catch {
    el("setup-deps-list").replaceChildren();
    el("setup-bundled-retry").classList.remove("hidden");
  }
}

async function runOllamaPrimary() {
  if (ollamaState === "running") return;

  if (ollamaState === "missing") {
    setOllamaError("");
    try {
      await window.api.ollamaOpenDownload();
    } catch {
      setOllamaError("Unable to open the Ollama download page.");
      return;
    }
    if (!(await refreshOllamaStep())) startInstallPolling();
    return;
  }

  setOllamaBusy(true);
  setOllamaError("");
  let result: { ok: boolean; error?: string };
  try {
    result = await window.api.ollamaStart();
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to start Ollama.",
    };
  }
  setOllamaBusy(false);
  if (!result.ok) {
    setOllamaError(result.error || "Unable to start Ollama.");
    return;
  }
  paintOllama("running");
  onOllamaReady?.();
}

async function skipOllama() {
  await window.api.setSettings({ ollamaSetupDeclined: true });
  trackWizardStep("embed");
  showStep("embed");
  await paintEmbedStep();
}

async function paintEmbedStep() {
  showStep("embed");
  let installed = false;
  try {
    installed = (await window.api.embedStatus()).installed;
  } catch {}
  el("setup-embed-installed").classList.toggle("hidden", !installed);
  el("setup-embed-offer").classList.toggle("hidden", installed);
}

async function installEmbedFromWizard() {
  el("setup-embed-offer").classList.add("hidden");
  el("setup-embed-progress").classList.remove("hidden");
  el("setup-embed-status").textContent = "Starting download…";
  window.api.installEmbed((s) => {
    if (s.error) {
      el("setup-embed-status").textContent = `Error: ${s.error}`;
      return;
    }
    if (s.done) {
      el("setup-embed-status").textContent = "Download complete";
      el("setup-embed-installed").classList.remove("hidden");
      el("setup-embed-progress").classList.add("hidden");
      return;
    }
    el("setup-embed-status").textContent = `Downloading… ${s.percent || 0}%`;
  });
}

async function skipEmbed() {
  await window.api.setSettings({ embedInstallDeclined: true });
  trackWizardStep("prefs");
  showStep("prefs");
}

async function acceptEmbed() {
  await window.api.setSettings({ embedInstallDeclined: false });
  await installEmbedFromWizard();
}

function showPrefsStep() {
  showStep("prefs");
}

async function finishWizard(checkUpdates: boolean) {
  await window.api.setSettings({
    setupWizardCompleted: true,
    checkUpdatesOnLaunch: checkUpdates,
  });
  captureProduct("onboarding_completed");
  if (checkUpdates) window.api.checkForUpdate();
  showStep("done");
}

async function completeWizard() {
  stopInstallPolling();
  hideWizard();
  finishFlow();
  onOllamaReady?.();
}

function bindWizard() {
  el("setup-welcome-next").onclick = async () => {
    trackWizardStep("ollama");
    showStep("ollama");
    await refreshOllamaStep();
  };

  el("setup-bundled-retry").onclick = async () => {
    el("setup-bundled-retry").disabled = true;
    try {
      const report = await window.api.startupRetry();
      renderDepsList(report);
      const bundledOk = report.deps.filter((d) => d.kind === "bundled").every((d) => d.ok);
      el("setup-bundled-retry").classList.toggle("hidden", bundledOk);
    } finally {
      el("setup-bundled-retry").disabled = false;
    }
  };

  el("setup-ollama-primary").onclick = runOllamaPrimary;
  el("setup-ollama-skip").onclick = skipOllama;
  el("setup-ollama-next").onclick = async () => {
    trackWizardStep("embed");
    showStep("embed");
    await paintEmbedStep();
  };

  el("setup-embed-yes").onclick = acceptEmbed;
  el("setup-embed-skip").onclick = skipEmbed;
  el("setup-embed-next").onclick = () => showPrefsStep();

  el("setup-prefs-yes").onclick = () => finishWizard(true);
  el("setup-prefs-no").onclick = () => finishWizard(false);
  el("setup-done-start").onclick = completeWizard;
}

export function initSetupWizard(onReady?: () => void): void {
  onOllamaReady = onReady;
  bindWizard();
}

export async function runSetupWizard(_settings: AppSettings): Promise<void> {
  if (!shouldRunSetupWizard(_settings)) return;

  showWizard();
  trackWizardStep("welcome");
  await loadWelcomeStep();

  return new Promise<void>((resolve) => {
    resolveFlow = resolve;
  });
}
