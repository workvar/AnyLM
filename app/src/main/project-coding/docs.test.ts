import { describe, expect, test } from "bun:test";
import { lookupCodingDocs } from "./docs";

describe("lookupCodingDocs", () => {
  test("returns block on success", async () => {
    const r = await lookupCodingDocs({
      text: "Create a Vite React TypeScript app",
      search: async () => "1. Vite guide\n   https://vitejs.dev\n   Use npm create vite@latest",
    });
    expect(r.note).toBeNull();
    expect(r.block).toMatch(/Vite|npm create/i);
  });
  test("soft-fails offline", async () => {
    const r = await lookupCodingDocs({
      text: "Create a Rust app",
      search: async () => {
        throw new Error("network down");
      },
    });
    expect(r.note).toMatch(/offline|skipped/i);
    expect(r.block).toBe("");
  });
  test("treats Error: search results as soft-fail", async () => {
    const r = await lookupCodingDocs({
      text: "Django project",
      search: async () => "Error: search returned HTTP 500",
    });
    expect(r.note).toMatch(/offline|skipped|failed/i);
  });
});
