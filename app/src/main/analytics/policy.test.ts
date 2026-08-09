import { describe, expect, test } from "bun:test";
import { filterEvent, type FilterInput } from "./policy";

const allOn: AnalyticsSettings = {
  productUsage: true,
  reliability: true,
  chatEvents: true,
  titles: true,
  modelAndTokens: true,
  truncatedMessageText: true,
  truncateChars: 200,
};

function input(overrides: Partial<FilterInput> & { draft: FilterInput["draft"] }): FilterInput {
  return {
    consent: true,
    analytics: allOn,
    hasKey: true,
    ...overrides,
  };
}

describe("filterEvent", () => {
  describe("gate: hasKey and consent", () => {
    test("returns null when hasKey is false", () => {
      expect(
        filterEvent(
          input({
            hasKey: false,
            draft: { event: "app_opened", category: "productUsage" },
          }),
        ),
      ).toBeNull();
    });

    test("returns null when consent is false", () => {
      expect(
        filterEvent(
          input({
            consent: false,
            draft: { event: "app_opened", category: "productUsage" },
          }),
        ),
      ).toBeNull();
    });

    test("allows when consent is null", () => {
      const result = filterEvent(
        input({
          consent: null,
          draft: { event: "app_opened", category: "productUsage" },
        }),
      );
      expect(result).toEqual({ event: "app_opened", properties: {} });
    });
  });

  describe("category toggles", () => {
    test("returns null when productUsage is off", () => {
      expect(
        filterEvent(
          input({
            analytics: { ...allOn, productUsage: false },
            draft: { event: "app_opened", category: "productUsage" },
          }),
        ),
      ).toBeNull();
    });

    test("returns null when reliability is off", () => {
      expect(
        filterEvent(
          input({
            analytics: { ...allOn, reliability: false },
            draft: { event: "error_occurred", category: "reliability" },
          }),
        ),
      ).toBeNull();
    });

    test("returns null when chatEvents is off", () => {
      expect(
        filterEvent(
          input({
            analytics: { ...allOn, chatEvents: false },
            draft: { event: "chat_sent", category: "chatEvents" },
          }),
        ),
      ).toBeNull();
    });
  });

  describe("chat_failed error_code", () => {
    test("strips error_code when reliability is off but chatEvents is on", () => {
      const result = filterEvent(
        input({
          analytics: { ...allOn, reliability: false, chatEvents: true },
          draft: {
            event: "chat_failed",
            category: "chatEvents",
            properties: { error_code: "timeout", other: "keep" },
          },
        }),
      );
      expect(result).toEqual({
        event: "chat_failed",
        properties: { other: "keep" },
      });
    });

    test("keeps error_code when reliability is on", () => {
      const result = filterEvent(
        input({
          draft: {
            event: "chat_failed",
            category: "chatEvents",
            properties: { error_code: "timeout" },
          },
        }),
      );
      expect(result?.properties.error_code).toBe("timeout");
    });
  });

  describe("titles", () => {
    test("strips title and project_title when titles is off", () => {
      const result = filterEvent(
        input({
          analytics: { ...allOn, titles: false },
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: { title: "My Chat", project_title: "Proj", foo: 1 },
          },
        }),
      );
      expect(result?.properties).toEqual({ foo: 1 });
    });

    test("keeps title and project_title when titles is on", () => {
      const result = filterEvent(
        input({
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: { title: "My Chat", project_title: "Proj" },
          },
        }),
      );
      expect(result?.properties).toEqual({ title: "My Chat", project_title: "Proj" });
    });
  });

  describe("modelAndTokens", () => {
    test("strips model and token fields when modelAndTokens is off", () => {
      const result = filterEvent(
        input({
          analytics: { ...allOn, modelAndTokens: false },
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: {
              model: "gpt-4",
              prompt_tokens: 100,
              completion_tokens: 50,
              keep: true,
            },
          },
        }),
      );
      expect(result?.properties).toEqual({ keep: true });
    });

    test("keeps model and token fields when modelAndTokens is on", () => {
      const result = filterEvent(
        input({
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: {
              model: "gpt-4",
              prompt_tokens: 100,
              completion_tokens: 50,
            },
          },
        }),
      );
      expect(result?.properties).toEqual({
        model: "gpt-4",
        prompt_tokens: 100,
        completion_tokens: 50,
      });
    });
  });

  describe("text_preview", () => {
    test("strips text_preview when truncatedMessageText is off", () => {
      const result = filterEvent(
        input({
          analytics: { ...allOn, truncatedMessageText: false },
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: { text_preview: "hello world", other: 1 },
          },
        }),
      );
      expect(result?.properties).toEqual({ other: 1 });
    });

    test("truncates text_preview to truncateChars", () => {
      const long = "a".repeat(300);
      const result = filterEvent(
        input({
          analytics: { ...allOn, truncateChars: 100 },
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: { text_preview: long },
          },
        }),
      );
      expect(result?.properties.text_preview).toBe("a".repeat(100));
      expect((result?.properties.text_preview as string).length).toBe(100);
    });

    test("coerces text_preview to string before truncating", () => {
      const result = filterEvent(
        input({
          analytics: { ...allOn, truncateChars: 50 },
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: { text_preview: 12345 },
          },
        }),
      );
      expect(result?.properties.text_preview).toBe("12345");
    });
  });

  describe("dangerous keys", () => {
    const dangerous = {
      email: "user@example.com",
      path: "/secret",
      file_path: "/secret/file.ts",
      tool_args: { cmd: "rm -rf" },
      tool_output: "output",
      content: "full message body",
      messages: [{ role: "user", content: "hi" }],
      safe: "keep",
    };

    test("always removes dangerous keys", () => {
      const result = filterEvent(
        input({
          draft: {
            event: "chat_sent",
            category: "chatEvents",
            properties: { ...dangerous },
          },
        }),
      );
      expect(result?.properties).toEqual({ safe: "keep" });
    });
  });

  test("passes through event name and returns empty properties object when none provided", () => {
    const result = filterEvent(
      input({
        draft: { event: "app_opened", category: "productUsage" },
      }),
    );
    expect(result).toEqual({ event: "app_opened", properties: {} });
  });
});
