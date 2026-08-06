import { describe, expect, test } from "bun:test";
import { labelFor, detailFor } from "./activity-labels";

describe("labelFor", () => {
  test("known tools", () => {
    expect(labelFor("web_search")).toBe("Searching the web");
    expect(labelFor("ask_user")).toBe("Asking a question");
    expect(labelFor("run_shell")).toBe("Running a command");
  });

  test("unknown falls back to name", () => {
    expect(labelFor("custom_tool")).toBe("custom_tool");
  });
});

describe("detailFor", () => {
  test("ask_user uses question", () => {
    expect(detailFor("ask_user", { question: "Pick one?" })).toBe("Pick one?");
  });

  test("generate_document title.format", () => {
    expect(detailFor("generate_document", { title: "Report", format: "docx" })).toBe(
      "Report.docx"
    );
  });

  test("web_search uses query", () => {
    expect(detailFor("web_search", { query: "bun test" })).toBe("bun test");
  });

  test("run_shell uses command", () => {
    expect(detailFor("run_shell", { command: "ls -la" })).toBe("ls -la");
  });

  test("http_fetch uses url", () => {
    expect(detailFor("http_fetch", { url: "https://example.com" })).toBe(
      "https://example.com"
    );
  });

  test("default uses first arg truncated", () => {
    expect(detailFor("read_file", { path: "/tmp/a.txt" })).toBe("/tmp/a.txt");
    expect(detailFor("read_file", { path: "x".repeat(80) })).toHaveLength(60);
  });

  test("empty args", () => {
    expect(detailFor("get_time", {})).toBe("");
  });
});
