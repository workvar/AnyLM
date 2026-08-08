import { el } from "./dom.js";

type PromptState = Exclude<OllamaSetupState, "running">;

const COPY: Record<
  PromptState,
  { title: string; body: string; primary: string; banner: string }
> = {
  missing: {
    title: "Ollama is not installed",
    body: "Ollama is required to run models locally.",
    primary: "Install Ollama",
    banner: "Ollama is not installed.",
  },
  installed: {
    title: "Ollama isn't running",
    body: "Ollama is installed but not running. Start it to use local models.",
    primary: "Start Ollama",
    banner: "Ollama isn’t running.",
  },
};

let currentState: PromptState = "missing";
let becameReady: (() => void) | undefined;
let resolveBlockingFlow: (() => void) | null = null;
let installPoll: ReturnType<typeof setInterval> | null = null;
let installPollAttempts = 0;

function stopInstallPolling() {
  if (installPoll !== null) {
    clearInterval(installPoll);
    installPoll = null;
  }
  installPollAttempts = 0;
}

function hideModal() {
  el("ollama-setup-modal").classList.add("hidden");
}

function hideBanner() {
  el("ollama-setup-banner").classList.add("hidden");
}

function hideSetup() {
  stopInstallPolling();
  hideModal();
  hideBanner();
}

function finishBlockingFlow() {
  const resolve = resolveBlockingFlow;
  resolveBlockingFlow = null;
  resolve?.();
}

function setStarting(starting: boolean) {
  el("ollama-setup-primary").disabled = starting;
  el("ollama-setup-banner-primary").disabled = starting;
}

function clearError() {
  for (const id of ["ollama-setup-error", "ollama-setup-banner-error"]) {
    const error = el(id);
    error.textContent = "";
    error.classList.add("hidden");
  }
}

function showError(message: string) {
  for (const id of ["ollama-setup-error", "ollama-setup-banner-error"]) {
    const error = el(id);
    error.textContent = message;
    error.classList.remove("hidden");
  }
}

function paint(state: PromptState) {
  currentState = state;
  const copy = COPY[state];
  el("ollama-setup-title").textContent = copy.title;
  el("ollama-setup-body").textContent = copy.body;
  el("ollama-setup-primary").textContent = copy.primary;
  el("ollama-setup-banner-text").textContent = copy.banner;
  el("ollama-setup-banner-primary").textContent = copy.primary;
  clearError();
  setStarting(false);
}

function showBanner() {
  hideModal();
  el("ollama-setup-banner").classList.remove("hidden");
}

function setupIsVisible() {
  return (
    !el("ollama-setup-modal").classList.contains("hidden") ||
    !el("ollama-setup-banner").classList.contains("hidden")
  );
}

function markReady() {
  hideSetup();
  finishBlockingFlow();
  becameReady?.();
}

async function probeForReady(): Promise<boolean> {
  try {
    const probe = await window.api.ollamaProbe();
    if (probe.state !== "running" || !setupIsVisible()) return false;
    markReady();
    return true;
  } catch {
    return false;
  }
}

function startInstallPolling() {
  stopInstallPolling();
  installPoll = setInterval(async () => {
    if (!setupIsVisible() || installPollAttempts >= 30) {
      stopInstallPolling();
      return;
    }
    installPollAttempts += 1;
    await probeForReady();
  }, 2000);
}

async function declineSetup() {
  clearError();
  try {
    await window.api.setSettings({ ollamaSetupDeclined: true });
  } catch {
    showError("Unable to save this preference.");
    return;
  }
  hideSetup();
  finishBlockingFlow();
}

async function runPrimaryAction() {
  if (currentState === "missing") {
    clearError();
    try {
      await window.api.ollamaOpenDownload();
    } catch {
      showError("Unable to open the Ollama download page.");
      return;
    }
    if (!(await probeForReady())) startInstallPolling();
    return;
  }

  clearError();
  setStarting(true);
  let result: { ok: boolean; error?: string };
  try {
    result = await window.api.ollamaStart();
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to start Ollama.",
    };
  }

  if (!result.ok) {
    showError(result.error || "Unable to start Ollama.");
    setStarting(false);
    return;
  }

  markReady();
}

export function initOllamaSetup(onBecameReady?: () => void): void {
  becameReady = onBecameReady;

  el("ollama-setup-later").onclick = declineSetup;
  el("ollama-setup-banner-later").onclick = declineSetup;
  el("ollama-setup-primary").onclick = runPrimaryAction;
  el("ollama-setup-banner-primary").onclick = runPrimaryAction;
  el("ollama-setup-modal").onclick = (event) => {
    if (event.target !== el("ollama-setup-modal")) return;
    showBanner();
    finishBlockingFlow();
  };
}

export async function runOllamaLaunchFlow(settings: AppSettings): Promise<void> {
  hideSetup();
  if (settings.ollamaSetupDeclined === true) return;

  const probe = await window.api.ollamaProbe();
  if (probe.state === "running") return;

  paint(probe.state);
  el("ollama-setup-modal").classList.remove("hidden");

  return new Promise<void>((resolve) => {
    resolveBlockingFlow = resolve;
  });
}
