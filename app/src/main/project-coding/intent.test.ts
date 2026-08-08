import { describe, expect, test } from "bun:test";
import { isProjectCodingIntent } from "./intent";

describe("isProjectCodingIntent", () => {
  test("create react app", () => {
    expect(isProjectCodingIntent("Create a React student list app in a new project")).toBe(true);
  });
  test("scaffold vite", () => {
    expect(isProjectCodingIntent("Scaffold a Vite TypeScript project")).toBe(true);
  });
  test("write component into project", () => {
    expect(isProjectCodingIntent("Write a LoginForm component into the project")).toBe(true);
  });
  test("pure Q&A stays false", () => {
    expect(isProjectCodingIntent("What is the difference between let and const?")).toBe(false);
  });
  test("explain how without creating files", () => {
    expect(isProjectCodingIntent("Explain how React hooks work")).toBe(false);
  });
  test("show example snippet without project ask", () => {
    expect(isProjectCodingIntent("Show me a small example snippet of a for loop")).toBe(false);
  });
  test("empty", () => {
    expect(isProjectCodingIntent("")).toBe(false);
  });
});
