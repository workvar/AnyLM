import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { state } from "./state";
import { getUseTools, setUseTools, toggleUseTools } from "./tools-toggle";
import { initToolsScopePrompt } from "./tools-scope-prompt";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeElement(id: string) {
  const classes = new Set<string>();
  return {
    id,
    title: "",
    textContent: "",
    innerHTML: "",
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    onclick: null as (() => void) | null,
    appendChild() {},
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      toggle: (name: string, force: boolean) => (force ? classes.add(name) : classes.delete(name)),
      contains: (name: string) => classes.has(name),
    },
    setAttribute() {},
  };
}

describe("toggleUseTools", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const elements = new Map<string, ReturnType<typeof fakeElement>>();

  beforeEach(() => {
    for (const id of [
      "tools-toggle",
      "tools-scope-modal",
      "tools-scope-title",
      "tools-scope-sub",
      "tools-scope-all",
      "tools-scope-this",
      "tools-scope-cancel",
      "update-toast",
      "up-title",
      "up-msg",
      "up-notes",
      "up-progress",
      "up-bar",
      "up-stats",
      "up-pill-text",
      "up-toast-ring",
      "up-actions",
    ]) {
      elements.set(id, fakeElement(id));
    }
    globalThis.document = {
      getElementById: (id: string) => elements.get(id) || null,
      addEventListener() {},
    } as unknown as Document;
    initToolsScopePrompt();
    setUseTools(false);
  });

  afterEach(() => {
    state.mode = null;
    state.current = null;
    state.thread = null;
    setUseTools(false);
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  test("a project toggle writes only the current thread, not the project default", async () => {
    const updates: Array<{ pid: string; tid: string; patch: Record<string, unknown> }> = [];
    let defaultCalls = 0;
    globalThis.window = {
      api: {
        setProjectDefaultUseTools: async () => {
          defaultCalls += 1;
          return null;
        },
        updateThread: async (pid: string, tid: string, patch: Record<string, unknown>) => {
          updates.push({ pid, tid, patch });
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "project";
    state.current = { id: "project-1", name: "One" };
    state.thread = { id: "thread-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-this")!.onclick!();
    await toggling;

    expect(defaultCalls).toBe(0);
    expect(updates).toEqual([{ pid: "project-1", tid: "thread-1", patch: { useTools: true } }]);
    expect(state.thread).toEqual({ id: "thread-1", useTools: true });
    expect(getUseTools()).toBe(true);
  });

  test("choosing all-new in a project sets the default and the current thread", async () => {
    const updates: Array<{ pid: string; tid: string; patch: Record<string, unknown> }> = [];
    globalThis.window = {
      api: {
        setProjectDefaultUseTools: async (id: string) =>
          ({ id, defaultUseTools: true }) as unknown as PublicProject,
        updateThread: async (pid: string, tid: string, patch: Record<string, unknown>) => {
          updates.push({ pid, tid, patch });
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "project";
    state.current = { id: "project-1", name: "One" };
    state.thread = { id: "thread-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-all")!.onclick!();
    await toggling;

    expect(updates).toEqual([{ pid: "project-1", tid: "thread-1", patch: { useTools: true } }]);
    expect(state.current.defaultUseTools).toBe(true);
    expect(getUseTools()).toBe(true);
  });

  test("does not apply a project response after leaving its initiating thread", async () => {
    const response = deferred<PublicProject | null>();
    globalThis.window = {
      api: {
        setProjectDefaultUseTools: () => response.promise,
        updateThread: async () => {},
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "project";
    state.current = { id: "project-1", name: "One" };
    state.thread = { id: "thread-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-all")!.onclick!();
    await Promise.resolve();
    state.current = { id: "project-2", name: "Two" };
    state.thread = { id: "thread-2", useTools: false };
    response.resolve({ id: "project-1", name: "Updated One" } as PublicProject);
    await toggling;

    expect(state.current).toEqual({ id: "project-2", name: "Two" });
    expect(state.thread).toEqual({ id: "thread-2", useTools: false });
    expect(getUseTools()).toBe(false);
  });

  test("persists a prompt choice to its initiating chat after navigation", async () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    globalThis.window = {
      api: {
        updateChat: async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "chat";
    state.current = { id: "chat-1", useTools: false };

    const toggling = toggleUseTools();
    state.current = { id: "chat-2", useTools: false };
    elements.get("tools-scope-this")!.onclick!();
    await toggling;

    expect(updates).toEqual([{ id: "chat-1", patch: { useTools: true } }]);
    expect(state.current).toEqual({ id: "chat-2", useTools: false });
    expect(getUseTools()).toBe(false);
  });

  test("persists to the initiating chat when navigation occurs during settings update", async () => {
    const settingsUpdate = deferred<AppSettings>();
    const settingsPatches: Array<Partial<AppSettings>> = [];
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    globalThis.window = {
      api: {
        setSettings: (patch: Partial<AppSettings>) => {
          settingsPatches.push(patch);
          return settingsUpdate.promise;
        },
        updateChat: async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "chat";
    state.current = { id: "chat-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-all")!.onclick!();
    await Promise.resolve();
    state.current = { id: "chat-2", useTools: false };
    settingsUpdate.resolve({ defaultUseToolsForChats: true } as AppSettings);
    await toggling;

    expect(settingsPatches).toEqual([{ defaultUseToolsForChats: true }]);
    expect(updates).toEqual([{ id: "chat-1", patch: { useTools: true } }]);
    expect(state.current).toEqual({ id: "chat-2", useTools: false });
    expect(getUseTools()).toBe(false);
  });

  test("disabling always offers the scope prompt, whatever the current default", async () => {
    const settingsPatches: Array<Partial<AppSettings>> = [];
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    globalThis.window = {
      api: {
        setSettings: async (patch: Partial<AppSettings>) => {
          settingsPatches.push(patch);
          return { defaultUseToolsForChats: false } as AppSettings;
        },
        updateChat: async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "chat";
    state.current = { id: "chat-1", useTools: true };
    setUseTools(true);

    const toggling = toggleUseTools();
    elements.get("tools-scope-all")!.onclick!();
    await toggling;

    expect(settingsPatches).toEqual([{ defaultUseToolsForChats: false }]);
    expect(updates).toEqual([{ id: "chat-1", patch: { useTools: false } }]);
    expect(getUseTools()).toBe(false);
  });

  test("cancelling the prompt changes nothing", async () => {
    const updates: unknown[] = [];
    globalThis.window = {
      api: {
        setSettings: async () => ({}) as AppSettings,
        updateChat: async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "chat";
    state.current = { id: "chat-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-cancel")!.onclick!();
    await toggling;

    expect(updates).toEqual([]);
    expect(getUseTools()).toBe(false);
  });

  test("surfaces an error when a project default update returns null", async () => {
    globalThis.window = {
      api: {
        setProjectDefaultUseTools: async () => null,
        updateThread: async () => {},
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "project";
    state.current = { id: "project-1", name: "One" };
    state.thread = { id: "thread-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-all")!.onclick!();
    await toggling;

    expect(elements.get("up-title")!.textContent).toBe("Couldn't update tools");
    expect(elements.get("update-toast")!.classList.contains("hidden")).toBe(false);
    expect(getUseTools()).toBe(false);
  });

  test("surfaces an error when chat persistence fails after updating settings", async () => {
    globalThis.window = {
      api: {
        setSettings: async () => ({ defaultUseToolsForChats: true }) as AppSettings,
        updateChat: async () => {
          throw new Error("disk full");
        },
      },
    } as unknown as Window & typeof globalThis;
    state.mode = "chat";
    state.current = { id: "chat-1", useTools: false };

    const toggling = toggleUseTools();
    elements.get("tools-scope-all")!.onclick!();
    await toggling;

    expect(elements.get("up-title")!.textContent).toBe("Couldn't update tools");
    expect(getUseTools()).toBe(false);
  });
});
