import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initOllamaSetup, runOllamaLaunchFlow } from "./ollama-setup";

class FakeClassList {
  private values = new Set<string>(["hidden"]);

  add(value: string) {
    this.values.add(value);
  }

  remove(value: string) {
    this.values.delete(value);
  }

  contains(value: string) {
    return this.values.has(value);
  }
}

class FakeElement {
  classList = new FakeClassList();
  disabled = false;
  onclick: ((event: { target: FakeElement }) => void | Promise<void>) | null = null;
  textContent = "";

  constructor(readonly id: string) {}
}

const ids = [
  "ollama-setup-modal",
  "ollama-setup-title",
  "ollama-setup-body",
  "ollama-setup-error",
  "ollama-setup-later",
  "ollama-setup-primary",
  "ollama-setup-banner",
  "ollama-setup-banner-text",
  "ollama-setup-banner-error",
  "ollama-setup-banner-later",
  "ollama-setup-banner-primary",
] as const;

let elements: Record<(typeof ids)[number], FakeElement>;
let api: {
  ollamaProbe: () => Promise<{
    state: "running" | "installed" | "missing";
    host: string;
    installPath: string | null;
  }>;
  ollamaStart: () => Promise<{ ok: boolean; error?: string }>;
  ollamaOpenDownload: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
};
let pollCallback: (() => void | Promise<void>) | null;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  pollCallback = null;
  elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)])) as typeof elements;
  api = {
    ollamaProbe: async () => ({
      state: "missing",
      host: "http://127.0.0.1:11434",
      installPath: null,
    }),
    ollamaStart: async () => ({ ok: true }),
    ollamaOpenDownload: async () => {},
    setSettings: async () => ({ ollamaSetupDeclined: true }) as AppSettings,
  };
  Object.assign(globalThis, {
    document: {
      getElementById: (id: (typeof ids)[number]) => elements[id],
    },
    window: { api },
    setInterval: (callback: () => void | Promise<void>) => {
      pollCallback = callback;
      return 1;
    },
    clearInterval: () => {},
  });
  initOllamaSetup();
});

afterEach(() => {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
});

describe("Ollama launch setup", () => {
  test("declined setup skips probing and UI", async () => {
    let probes = 0;
    api.ollamaProbe = async () => {
      probes += 1;
      return { state: "missing", host: "", installPath: null };
    };

    await runOllamaLaunchFlow({ ollamaSetupDeclined: true } as AppSettings);

    expect(probes).toBe(0);
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(true);
  });

  test("missing setup opens download and backdrop moves it to the banner", async () => {
    let downloads = 0;
    api.ollamaOpenDownload = async () => {
      downloads += 1;
    };

    const flow = runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();

    expect(elements["ollama-setup-title"].textContent).toBe("Ollama is not installed");
    expect(elements["ollama-setup-body"].textContent).toBe(
      "Ollama is required to run models locally."
    );
    expect(elements["ollama-setup-primary"].textContent).toBe("Install Ollama");
    expect(elements["ollama-setup-banner-text"].textContent).toBe("Ollama is not installed.");

    await elements["ollama-setup-primary"].onclick?.({
      target: elements["ollama-setup-primary"],
    });
    expect(downloads).toBe(1);
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(false);

    elements["ollama-setup-modal"].onclick?.({ target: elements["ollama-setup-modal"] });
    await flow;
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(true);
    expect(elements["ollama-setup-banner"].classList.contains("hidden")).toBe(false);
    await elements["ollama-setup-banner-later"].onclick?.({
      target: elements["ollama-setup-banner-later"],
    });
  });

  test("Install polling clears setup when Ollama becomes reachable", async () => {
    let state: "missing" | "running" = "missing";
    api.ollamaProbe = async () => ({
      state,
      host: "http://127.0.0.1:11434",
      installPath: state === "running" ? "/usr/local/bin/ollama" : null,
    });
    let ready = 0;
    initOllamaSetup(() => {
      ready += 1;
    });

    const flow = runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();
    await elements["ollama-setup-primary"].onclick?.({
      target: elements["ollama-setup-primary"],
    });
    expect(pollCallback).not.toBeNull();

    state = "running";
    await pollCallback?.();
    await flow;

    expect(ready).toBe(1);
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(true);
    expect(elements["ollama-setup-banner"].classList.contains("hidden")).toBe(true);
  });

  test("Install reports a download failure and leaves setup visible", async () => {
    api.ollamaOpenDownload = async () => {
      throw new Error("shell failed");
    };

    void runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();
    await elements["ollama-setup-primary"].onclick?.({
      target: elements["ollama-setup-primary"],
    });

    expect(elements["ollama-setup-error"].textContent).toBe(
      "Unable to open the Ollama download page."
    );
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(false);
  });

  test("Later persists the decline and resolves the blocking flow", async () => {
    let saved: Partial<AppSettings> | null = null;
    api.setSettings = async (patch) => {
      saved = patch;
      return { ...patch } as AppSettings;
    };

    const flow = runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();
    await elements["ollama-setup-later"].onclick?.({
      target: elements["ollama-setup-later"],
    });
    await flow;

    expect(saved).toEqual({ ollamaSetupDeclined: true });
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(true);
    expect(elements["ollama-setup-banner"].classList.contains("hidden")).toBe(true);
  });

  test("Later reports a settings failure and leaves setup visible", async () => {
    api.setSettings = async () => {
      throw new Error("disk full");
    };

    void runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();
    await elements["ollama-setup-later"].onclick?.({
      target: elements["ollama-setup-later"],
    });

    expect(elements["ollama-setup-error"].textContent).toBe(
      "Unable to save this preference."
    );
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(false);
  });

  test("installed setup reports start failure then notifies on success", async () => {
    api.ollamaProbe = async () => ({
      state: "installed",
      host: "http://127.0.0.1:11434",
      installPath: "/usr/local/bin/ollama",
    });
    let startResult: { ok: boolean; error?: string } = { ok: false, error: "Could not start" };
    api.ollamaStart = async () => startResult;
    let ready = 0;
    initOllamaSetup(() => {
      ready += 1;
    });

    const flow = runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();

    expect(elements["ollama-setup-title"].textContent).toBe("Ollama isn't running");
    expect(elements["ollama-setup-banner-text"].textContent).toBe("Ollama isn’t running.");
    await elements["ollama-setup-primary"].onclick?.({
      target: elements["ollama-setup-primary"],
    });
    expect(elements["ollama-setup-error"].textContent).toBe("Could not start");
    expect(elements["ollama-setup-primary"].disabled).toBe(false);

    startResult = { ok: true };
    await elements["ollama-setup-primary"].onclick?.({
      target: elements["ollama-setup-primary"],
    });
    await flow;

    expect(ready).toBe(1);
    expect(elements["ollama-setup-modal"].classList.contains("hidden")).toBe(true);
  });

  test("banner shows an Ollama start failure after backdrop dismissal", async () => {
    api.ollamaProbe = async () => ({
      state: "installed",
      host: "http://127.0.0.1:11434",
      installPath: "/usr/local/bin/ollama",
    });
    api.ollamaStart = async () => ({ ok: false, error: "Ollama timed out" });

    const flow = runOllamaLaunchFlow({ ollamaSetupDeclined: null } as AppSettings);
    await tick();
    elements["ollama-setup-modal"].onclick?.({ target: elements["ollama-setup-modal"] });
    await flow;

    await elements["ollama-setup-banner-primary"].onclick?.({
      target: elements["ollama-setup-banner-primary"],
    });

    expect(elements["ollama-setup-banner"].classList.contains("hidden")).toBe(false);
    expect(elements["ollama-setup-banner-error"].textContent).toBe("Ollama timed out");
    expect(elements["ollama-setup-banner-error"].classList.contains("hidden")).toBe(false);
  });
});
