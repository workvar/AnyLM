import { beforeEach, describe, expect, test } from "bun:test";
import { initSetupWizard, runSetupWizard, shouldRunSetupWizard } from "./setup-wizard";

class FakeClassList {
  private values = new Set<string>(["hidden"]);

  add(value: string) {
    this.values.add(value);
  }

  remove(value: string) {
    this.values.delete(value);
  }

  toggle(value: string, force?: boolean) {
    if (force === true) this.values.add(value);
    else if (force === false) this.values.delete(value);
    else if (this.values.has(value)) this.values.delete(value);
    else this.values.add(value);
  }

  contains(value: string) {
    return this.values.has(value);
  }
}

class FakeList {
  replaceChildren() {}
  appendChild() {}
}

class FakeElement {
  classList = new FakeClassList();
  disabled = false;
  onclick: (() => void | Promise<void>) | null = null;
  textContent = "";
  className = "";
  replaceChildren = () => {};
  appendChild = () => {};
  append = () => {};

  constructor(readonly id: string) {}
}

const ids = [
  "setup-wizard",
  "setup-wizard-progress",
  "setup-step-welcome",
  "setup-step-ollama",
  "setup-step-embed",
  "setup-step-prefs",
  "setup-step-done",
  "setup-deps-list",
  "setup-bundled-retry",
  "setup-welcome-next",
  "setup-ollama-running",
  "setup-ollama-action",
  "setup-ollama-title",
  "setup-ollama-body",
  "setup-ollama-error",
  "setup-ollama-skip",
  "setup-ollama-primary",
  "setup-ollama-next",
  "setup-embed-installed",
  "setup-embed-offer",
  "setup-embed-progress",
  "setup-embed-status",
  "setup-embed-yes",
  "setup-embed-skip",
  "setup-embed-next",
  "setup-prefs-yes",
  "setup-prefs-no",
  "setup-done-start",
] as const;

let elements: Record<(typeof ids)[number], FakeElement>;
let api: {
  startupDeps: () => Promise<StartupDepsReport>;
  startupRetry: () => Promise<StartupDepsReport>;
  ollamaProbe: () => Promise<{ state: OllamaSetupState; host: string; installPath: string | null }>;
  ollamaOpenDownload: () => Promise<void>;
  ollamaStart: () => Promise<{ ok: boolean; error?: string }>;
  embedStatus: () => Promise<{ model: string; installed: boolean }>;
  installEmbed: (cb: (s: EmbedState) => void) => void;
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  checkForUpdate: () => void;
  analyticsCapture: (draft: AnalyticsCaptureDraft) => Promise<void>;
};

beforeEach(() => {
  elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)])) as typeof elements;
  api = {
    startupDeps: async () => ({
      ready: true,
      deps: [
        { id: "chroma", kind: "bundled", ok: true, message: "Chroma memory backend is ready." },
        { id: "graph", kind: "bundled", ok: true, message: "Knowledge graph store is ready." },
        { id: "ollama", kind: "external", ok: false, message: "Ollama is not installed." },
      ],
    }),
    startupRetry: async () => ({
      ready: true,
      deps: [
        { id: "chroma", kind: "bundled", ok: true, message: "Chroma memory backend is ready." },
        { id: "graph", kind: "bundled", ok: true, message: "Knowledge graph store is ready." },
        { id: "ollama", kind: "external", ok: false, message: "Ollama is not installed." },
      ],
    }),
    ollamaProbe: async () => ({ state: "missing", host: "", installPath: null }),
    ollamaOpenDownload: async () => {},
    ollamaStart: async () => ({ ok: true }),
    embedStatus: async () => ({ model: "nomic-embed-text", installed: false }),
    installEmbed: () => {},
    setSettings: async (patch) => ({ ...(patch as AppSettings), setupWizardCompleted: true }),
    checkForUpdate: () => {},
    analyticsCapture: async () => {},
  };
  Object.assign(globalThis, {
    document: {
      getElementById: (id: (typeof ids)[number]) => elements[id],
      createElement: () => {
        const node = new FakeElement("dynamic");
        node.classList = new FakeClassList();
        return node;
      },
    },
    window: { api },
  });
  initSetupWizard();
});

describe("shouldRunSetupWizard", () => {
  test("runs when not completed", () => {
    expect(shouldRunSetupWizard({ setupWizardCompleted: null } as AppSettings)).toBe(true);
  });
  test("skips when completed", () => {
    expect(shouldRunSetupWizard({ setupWizardCompleted: true } as AppSettings)).toBe(false);
  });
});

describe("runSetupWizard", () => {
  test("opens wizard on first run", async () => {
    const flow = runSetupWizard({ setupWizardCompleted: null } as AppSettings);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(elements["setup-wizard"].classList.contains("hidden")).toBe(false);
    expect(elements["setup-step-welcome"].classList.contains("hidden")).toBe(false);
    await elements["setup-welcome-next"].onclick?.();
    expect(elements["setup-step-ollama"].classList.contains("hidden")).toBe(false);
    await elements["setup-ollama-skip"].onclick?.();
    expect(elements["setup-step-embed"].classList.contains("hidden")).toBe(false);
    await elements["setup-embed-skip"].onclick?.();
    expect(elements["setup-step-prefs"].classList.contains("hidden")).toBe(false);
    await elements["setup-prefs-no"].onclick?.();
    expect(elements["setup-step-done"].classList.contains("hidden")).toBe(false);
    await elements["setup-done-start"].onclick?.();
    await flow;
    expect(elements["setup-wizard"].classList.contains("hidden")).toBe(true);
  });

  test("skips when already completed", async () => {
    await runSetupWizard({ setupWizardCompleted: true } as AppSettings);
    expect(elements["setup-wizard"].classList.contains("hidden")).toBe(true);
  });
});
