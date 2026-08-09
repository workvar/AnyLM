import { describe, expect, test } from "bun:test";
import { allowlistFor, filterToolDefs } from "./allowlists";

test("research allowlist includes web_search and http_fetch", () => {
  expect(allowlistFor("research")).toEqual(
    expect.arrayContaining(["web_search", "http_fetch"])
  );
});

test("summarize has empty allowlist meaning no tools", () => {
  expect(allowlistFor("summarize")).toEqual([]);
});

test("filterToolDefs keeps only allowlisted", () => {
  const defs = [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "run_shell",
        description: "",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ] as OllamaToolDef[];
  const filtered = filterToolDefs(defs, ["web_search"]);
  expect(filtered?.map((d) => d.function.name)).toEqual(["web_search"]);
});
