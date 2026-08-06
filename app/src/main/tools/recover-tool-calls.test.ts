import { describe, expect, test } from "bun:test";
import { recoverToolCalls } from "./recover-tool-calls";

const allow = ["http_fetch", "web_search", "run_shell"];

describe("recoverToolCalls", () => {
  test("screenshot-style http_fetch with parameters in a fence", () => {
    const text =
      `Based on the available functions, we can call the fetch tool:\n\n` +
      "```json\n" +
      `{"name": "http_fetch", "parameters": {"url": "https://yasharyan.dev", "method": "GET"}}\n` +
      "```\n";
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toEqual([
      {
        function: {
          name: "http_fetch",
          arguments: { url: "https://yasharyan.dev", method: "GET" },
        },
      },
    ]);
    expect(cleanedText).not.toContain('"name": "http_fetch"');
    expect(cleanedText).not.toContain("```");
    expect(cleanedText).toContain("Based on the available functions");
  });

  test("arguments key also works", () => {
    const text = `{"name": "http_fetch", "arguments": {"url": "https://example.com"}}`;
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toHaveLength(1);
    expect(calls[0].function?.name).toBe("http_fetch");
    expect(calls[0].function?.arguments).toEqual({ url: "https://example.com" });
    expect(cleanedText.trim()).toBe("");
  });

  test("unknown name ignored; text unchanged", () => {
    const text = `{"name": "not_a_tool", "parameters": {"x": "1"}}`;
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toEqual([]);
    expect(cleanedText).toBe(text);
  });

  test("non-tool JSON ignored", () => {
    const text = `Here is data: {"foo": 1, "bar": 2}`;
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toEqual([]);
    expect(cleanedText).toBe(text);
  });

  test("two valid objects; order preserved; cap at 3", () => {
    const text =
      `{"name":"web_search","parameters":{"query":"a"}}\n` +
      `{"name":"http_fetch","parameters":{"url":"https://a"}}\n` +
      `{"name":"web_search","parameters":{"query":"b"}}\n` +
      `{"name":"web_search","parameters":{"query":"c"}}`;
    const { calls } = recoverToolCalls(text, allow);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.function?.arguments?.query ?? c.function?.arguments?.url)).toEqual([
      "a",
      "https://a",
      "b",
    ]);
  });

  test("name not in allowlist skipped even if JSON valid", () => {
    const text = `{"name":"run_shell","parameters":{"command":"doit"}}`;
    const { calls, cleanedText } = recoverToolCalls(text, ["http_fetch"]);
    expect(calls).toEqual([]);
    expect(cleanedText).toBe(text);
  });

  test("unbalanced brace earlier does not abandon a later valid bare call", () => {
    const text =
      `Here's a note { that never closes and rambles on without a matching brace.\n\n` +
      `{"name":"http_fetch","parameters":{"url":"https://x"}}`;
    const { calls } = recoverToolCalls(text, allow);
    expect(calls).toHaveLength(1);
    expect(calls[0].function?.name).toBe("http_fetch");
    expect(calls[0].function?.arguments).toEqual({ url: "https://x" });
  });

  test("coerces non-string arg values to strings", () => {
    const text = `{"name":"http_fetch","parameters":{"url":"https://x","method":"GET"}}`;
    // Also cover numeric-looking via JSON number:
    const text2 = `{"name":"web_search","parameters":{"query":123}}`;
    expect(recoverToolCalls(text2, allow).calls[0].function?.arguments?.query).toBe("123");
    expect(recoverToolCalls(text, allow).calls[0].function?.arguments?.method).toBe("GET");
  });
});
