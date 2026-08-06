// src/renderer/js/web-research-hint.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import {
  nextWebResearchHintDismissed,
  nextWebResearchSkillOverrides,
  shouldShowWebResearchHint,
  syncWebResearchHint,
} from "./web-research-hint";

describe("shouldShowWebResearchHint", () => {
  const base = {
    text: "Read https://example.com",
    globalEnabled: false,
    skillOverrides: [] as string[],
    dismissed: false,
  };
  test("shows when URL and skill inactive", () => {
    expect(shouldShowWebResearchHint(base)).toBe(true);
  });
  test("hidden when global enabled", () => {
    expect(shouldShowWebResearchHint({ ...base, globalEnabled: true })).toBe(false);
  });
  test("hidden when override present", () => {
    expect(
      shouldShowWebResearchHint({ ...base, skillOverrides: ["web-research"] })
    ).toBe(false);
  });
  test("hidden when dismissed", () => {
    expect(shouldShowWebResearchHint({ ...base, dismissed: true })).toBe(false);
  });
  test("hidden without URL", () => {
    expect(shouldShowWebResearchHint({ ...base, text: "no link here" })).toBe(false);
  });
});

describe("dismiss state", () => {
  test("stays dismissed while the input still contains a URL", () => {
    expect(nextWebResearchHintDismissed(true, "Read https://example.com please")).toBe(true);
  });

  test("clears dismissal after the URL is removed", () => {
    expect(nextWebResearchHintDismissed(true, "no link here")).toBe(false);
  });
});

describe("override snapshots", () => {
  test("adds Web research once for per-conversation enable", () => {
    expect(nextWebResearchSkillOverrides(["other", "web-research"], false)).toEqual([
      "other",
      "web-research",
    ]);
  });

  test("removes Web research from a captured snapshot for global enable", () => {
    const snapshot = ["other", "web-research"];

    expect(nextWebResearchSkillOverrides(snapshot, true)).toEqual(["other"]);
    expect(snapshot).toEqual(["other", "web-research"]);
  });
});

describe("hint synchronization", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  test("does not list skills when the composer has no URL", async () => {
    let listCalls = 0;
    const host = {
      classList: { add() {}, toggle() {} },
      dataset: {},
    };
    const input = { value: "ordinary prompt" };
    globalThis.document = {
      getElementById: (id: string) => (id === "chat-input" ? input : host),
    } as unknown as Document;
    globalThis.window = {
      api: {
        skillsList: async () => {
          listCalls += 1;
          return [];
        },
      },
    } as unknown as Window & typeof globalThis;

    await syncWebResearchHint();

    expect(listCalls).toBe(0);
  });

  test("builds the chip before async visibility checks and only once", async () => {
    let resolveSkills: (skills: Array<{ id: string; enabled: boolean }>) => void;
    const skills = new Promise<Array<{ id: string; enabled: boolean }>>((resolve) => {
      resolveSkills = resolve;
    });
    const hostChildren: unknown[] = [];
    const host = {
      classList: { add() {}, toggle() {} },
      dataset: {} as Record<string, string>,
      append: (...children: unknown[]) => hostChildren.push(...children),
    };
    const input = { value: "Read https://example.com" };
    globalThis.document = {
      getElementById: (id: string) => (id === "chat-input" ? input : host),
      createElement: () => ({
        append() {},
        setAttribute() {},
      }),
    } as unknown as Document;
    globalThis.window = {
      api: {
        skillsList: () => skills,
      },
    } as unknown as Window & typeof globalThis;

    const first = syncWebResearchHint();
    const second = syncWebResearchHint();
    expect(hostChildren).toHaveLength(2);
    resolveSkills!([]);
    await Promise.all([first, second]);

    expect(hostChildren).toHaveLength(2);
  });
});
