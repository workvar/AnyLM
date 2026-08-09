import { describe, expect, mock, spyOn, test } from "bun:test";
import * as analytics from "./events";
import { captureWith, type CaptureSink } from "./events";
import type { EventDraft } from "./policy";

const allOn: AnalyticsSettings = {
  productUsage: true,
  reliability: true,
  chatEvents: true,
  titles: true,
  modelAndTokens: true,
  truncatedMessageText: true,
  truncateChars: 200,
};

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    analyticsConsent: true,
    analytics: allOn,
    ...overrides,
  } as AppSettings;
}

describe("captureWith", () => {
  test("filters via policy then calls sink", () => {
    const captured: Array<{ distinctId: string; event: string; properties: Record<string, unknown> }> =
      [];
    const sink: CaptureSink = {
      capture: (payload) => {
        captured.push(payload);
      },
    };

    captureWith(
      {
        event: "message_sent",
        category: "chatEvents",
        properties: { role: "user", email: "secret@example.com", text_preview: "hello" },
      },
      {
        readSettings: () => settings(),
        hasKey: true,
        getDistinctId: () => "anon-1",
        sink,
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      distinctId: "anon-1",
      event: "message_sent",
      properties: { role: "user", text_preview: "hello" },
    });
  });

  test("does not call sink when consent is false", () => {
    const capture = mock(() => {});
    captureWith(
      { event: "app_opened", category: "productUsage" },
      {
        readSettings: () => settings({ analyticsConsent: false }),
        hasKey: true,
        getDistinctId: () => "anon-1",
        sink: { capture },
      },
    );
    expect(capture).not.toHaveBeenCalled();
  });

  test("does not call sink when sink is null", () => {
    expect(() =>
      captureWith(
        { event: "app_opened", category: "productUsage" },
        {
          readSettings: () => settings(),
          hasKey: true,
          getDistinctId: () => "anon-1",
          sink: null,
        },
      ),
    ).not.toThrow();
  });

  test("never throws when sink.capture throws", () => {
    const draft: EventDraft = { event: "app_opened", category: "productUsage" };
    expect(() =>
      captureWith(draft, {
        readSettings: () => settings(),
        hasKey: true,
        getDistinctId: () => "anon-1",
        sink: {
          capture: () => {
            throw new Error("network down");
          },
        },
      }),
    ).not.toThrow();
  });

  test("never throws when readSettings throws", () => {
    expect(() =>
      captureWith(
        { event: "app_opened", category: "productUsage" },
        {
          readSettings: () => {
            throw new Error("settings boom");
          },
          hasKey: true,
          getDistinctId: () => "anon-1",
          sink: { capture: () => {} },
        },
      ),
    ).not.toThrow();
  });

  test("merges baseProperties from deps into sink payload", () => {
    const captured: Array<{ distinctId: string; event: string; properties: Record<string, unknown> }> =
      [];
    captureWith(
      { event: "app_opened", category: "productUsage" },
      {
        readSettings: () => settings(),
        hasKey: true,
        getDistinctId: () => "anon-1",
        sink: {
          capture: (payload) => {
            captured.push(payload);
          },
        },
        baseProperties: { app: "desktop", platform: "darwin", app_version: "1.2.3" },
      },
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].properties).toEqual({
      app: "desktop",
      platform: "darwin",
      app_version: "1.2.3",
    });
  });

  test("event properties override baseProperties", () => {
    const captured: Array<{ properties: Record<string, unknown> }> = [];
    captureWith(
      {
        event: "feature_used",
        category: "productUsage",
        properties: { feature: "tools_toggled", app: "override" },
      },
      {
        readSettings: () => settings(),
        hasKey: true,
        getDistinctId: () => "anon-1",
        sink: { capture: (payload) => captured.push(payload) },
        baseProperties: { app: "desktop", platform: "linux" },
      },
    );
    expect(captured[0].properties).toEqual({
      app: "override",
      platform: "linux",
      feature: "tools_toggled",
    });
  });
});

describe("trackAppClosed", () => {
  test("emits app_closed", () => {
    const spy = spyOn(analytics, "capture").mockImplementation(() => {});
    analytics.trackAppClosed();
    expect(spy).toHaveBeenCalledWith({ event: "app_closed", category: "productUsage" });
    spy.mockRestore();
  });
});

describe("taxonomy helpers", () => {
  test("trackApiRequestFailed emits reliability event", () => {
    const spy = spyOn(analytics, "capture").mockImplementation(() => {});
    analytics.trackApiRequestFailed({
      operation: "proxy_models",
      error_type: "auth_failed",
      http_status: 401,
    });
    expect(spy).toHaveBeenCalledWith({
      event: "api_request_failed",
      category: "reliability",
      properties: { operation: "proxy_models", error_type: "auth_failed", http_status: 401 },
    });
    spy.mockRestore();
  });

  test("trackFileOpened emits productUsage event", () => {
    const spy = spyOn(analytics, "capture").mockImplementation(() => {});
    analytics.trackFileOpened({ source: "generated", feature: "viewer" });
    expect(spy).toHaveBeenCalledWith({
      event: "file_opened",
      category: "productUsage",
      properties: { source: "generated", feature: "viewer" },
    });
    spy.mockRestore();
  });

  test("trackFileExported emits productUsage event", () => {
    const spy = spyOn(analytics, "capture").mockImplementation(() => {});
    analytics.trackFileExported({ source: "governance", feature: "usage_csv" });
    expect(spy).toHaveBeenCalledWith({
      event: "file_exported",
      category: "productUsage",
      properties: { source: "governance", feature: "usage_csv" },
    });
    spy.mockRestore();
  });
});
