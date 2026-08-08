import { describe, expect, test } from "bun:test";
import { buildProjectSummary, stripLargeCodeFences } from "./summary";

describe("stripLargeCodeFences", () => {
  test("keeps short fence", () => {
    const t = "Hi\n```js\nconst x = 1;\n```\nDone";
    expect(stripLargeCodeFences(t)).toContain("const x = 1");
  });
  test("strips long fence", () => {
    const body = Array.from({ length: 25 }, (_, i) => `line${i}`).join("\n");
    const t = `Intro\n\`\`\`ts\n${body}\n\`\`\`\nOutro`;
    const out = stripLargeCodeFences(t);
    expect(out).not.toContain("line10");
    expect(out).toMatch(/written to files|see list|Code written/i);
  });
});

describe("buildProjectSummary", () => {
  test("lists write_file and run_shell", () => {
    const s = buildProjectSummary({
      root: "/tmp/proj",
      docsNote: null,
      outcomes: [
        { name: "run_shell", args: { command: "npm create vite@latest ." }, output: "ok" },
        { name: "write_file", args: { path: "src/App.tsx", content: "..." }, output: "Wrote src/App.tsx" },
      ],
    });
    expect(s).toContain("/tmp/proj");
    expect(s).toContain("npm create vite@latest");
    expect(s).toContain("src/App.tsx");
  });
  test("notes denied shell", () => {
    const s = buildProjectSummary({
      root: "/tmp/p",
      outcomes: [{ name: "run_shell", args: { command: "cargo new x" }, output: "Denied", denied: true }],
    });
    expect(s).toMatch(/denied|skipped/i);
  });
  test("notes offline docs", () => {
    const s = buildProjectSummary({
      root: "/tmp/p",
      docsNote: "docs lookup skipped (offline)",
      outcomes: [],
    });
    expect(s).toContain("docs lookup skipped (offline)");
  });
});
