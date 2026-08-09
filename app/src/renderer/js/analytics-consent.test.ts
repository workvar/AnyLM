import { beforeEach, describe, expect, test } from "bun:test";
import { runAnalyticsConsentFlow } from "./analytics-consent";

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
  onclick: (() => void | Promise<void>) | null = null;

  constructor(readonly id: string) {}
}

const ids = [
  "analytics-consent",
  "analytics-consent-accept",
  "analytics-consent-decline",
  "analytics-consent-configure",
] as const;

let elements: Record<(typeof ids)[number], FakeElement>;
let api: {
  analyticsAvailable: () => Promise<boolean>;
  analyticsClarityConfig: () => Promise<{ id: string | null; enabled: boolean }>;
  getVersion: () => Promise<string>;
  authMe: () => Promise<AuthUser | null>;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)])) as typeof elements;
  api = {
    analyticsAvailable: async () => true,
    analyticsClarityConfig: async () => ({ id: null, enabled: false }),
    getVersion: async () => "0.0.0",
    authMe: async () => null,
    platform: "darwin",
    isPackaged: false,
    setSettings: async (patch) => patch as AppSettings,
  };
  Object.assign(globalThis, {
    document: {
      getElementById: (id: (typeof ids)[number]) => elements[id],
    },
    window: { api },
  });
});

describe("runAnalyticsConsentFlow", () => {
  test("resolves immediately when consent already set", async () => {
    let availableCalls = 0;
    api.analyticsAvailable = async () => {
      availableCalls += 1;
      return true;
    };

    await runAnalyticsConsentFlow({ analyticsConsent: false } as AppSettings);

    expect(availableCalls).toBe(0);
    expect(elements["analytics-consent"].classList.contains("hidden")).toBe(true);
  });

  test("skips modal when analytics unavailable", async () => {
    api.analyticsAvailable = async () => false;

    await runAnalyticsConsentFlow({ analyticsConsent: null } as AppSettings);

    expect(elements["analytics-consent"].classList.contains("hidden")).toBe(true);
  });

  test("Accept sets analyticsConsent true and hides modal", async () => {
    let patch: Partial<AppSettings> | null = null;
    api.setSettings = async (p) => {
      patch = p;
      return p as AppSettings;
    };

    const done = runAnalyticsConsentFlow({ analyticsConsent: null } as AppSettings);
    await tick();
    expect(elements["analytics-consent"].classList.contains("hidden")).toBe(false);

    await elements["analytics-consent-accept"].onclick?.();
    await done;

    expect(patch).toEqual({ analyticsConsent: true });
    expect(elements["analytics-consent"].classList.contains("hidden")).toBe(true);
  });

  test("Decline sets analyticsConsent false", async () => {
    let patch: Partial<AppSettings> | null = null;
    api.setSettings = async (p) => {
      patch = p;
      return p as AppSettings;
    };

    const done = runAnalyticsConsentFlow({ analyticsConsent: null } as AppSettings);
    await tick();
    await elements["analytics-consent-decline"].onclick?.();
    await done;

    expect(patch).toEqual({ analyticsConsent: false });
    expect(elements["analytics-consent"].classList.contains("hidden")).toBe(true);
  });

  test("Configure opens privacy without setting consent", async () => {
    let setCalls = 0;
    let opened: string | null = null;
    api.setSettings = async (p) => {
      setCalls += 1;
      return p as AppSettings;
    };

    const done = runAnalyticsConsentFlow({ analyticsConsent: null } as AppSettings, {
      openPrivacy: () => {
        opened = "privacy";
      },
    });
    await tick();
    await elements["analytics-consent-configure"].onclick?.();
    await done;

    expect(setCalls).toBe(0);
    expect(opened).toBe("privacy");
    expect(elements["analytics-consent"].classList.contains("hidden")).toBe(true);
  });
});
