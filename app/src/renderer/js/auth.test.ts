import { beforeEach, expect, test } from "bun:test";
import { initAuth } from "./auth";

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
  }

  contains(value: string) {
    return this.values.has(value);
  }
}

class FakeElement {
  classList = new FakeClassList();
  dataset: Record<string, string> = {};
  disabled = false;
  onclick: ((event: any) => void | Promise<void>) | null = null;
  onsubmit: ((event: any) => void | Promise<void>) | null = null;
  textContent = "";
  title = "";
  value = "";
}

const ids = [
  "app",
  "auth-email",
  "auth-error",
  "auth-form",
  "auth-name",
  "auth-password",
  "auth-screen",
  "auth-sub",
  "auth-submit",
  "auth-toggle-link",
  "auth-toggle-text",
  "boot-splash",
  "logout-btn",
  "user-avatar",
  "user-name",
  "user-popup",
  "user-row",
] as const;

let elements: Record<(typeof ids)[number], FakeElement>;

beforeEach(() => {
  elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()])) as typeof elements;
  Object.assign(globalThis, {
    document: {
      addEventListener: () => {},
      getElementById: (id: (typeof ids)[number]) => elements[id],
      querySelectorAll: () => [],
    },
    window: {
      api: {
        authMe: async () => {
          throw new Error("network unavailable");
        },
      },
    },
  });
});

test("auth failure hides the boot splash and shows sign in", async () => {
  const result = await initAuth(() => {});

  expect(result).toBe(false);
  expect(elements["boot-splash"].classList.contains("hidden")).toBe(true);
  expect(elements["auth-screen"].classList.contains("hidden")).toBe(false);
  expect(elements.app.classList.contains("hidden")).toBe(true);
});
