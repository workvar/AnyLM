import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SNIPPET_TOKENS } from "./code-sample.tokens";

describe("SNIPPET_TOKENS", () => {
  it("includes all token kinds", () => {
    const kinds = new Set(SNIPPET_TOKENS.map((t) => t.kind));
    for (const k of ["keyword", "name", "string", "punct", "plain"] as const) {
      assert.ok(kinds.has(k), `missing kind ${k}`);
    }
  });

  it("reconstructs the OpenAI snippet", () => {
    const joined = SNIPPET_TOKENS.map((t) => t.text).join("");
    assert.match(joined, /from openai import OpenAI/);
    assert.match(joined, /base_url=/);
    assert.match(joined, /localhost:3227/);
  });

  it("does not mark the whole file as one green blob", () => {
    assert.ok(SNIPPET_TOKENS.length > 20);
  });
});
