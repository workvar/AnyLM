import { describe, expect, test } from "bun:test";
import { ensureWorkspaceForCoding, resolveAutoProjectPath } from "./ensure";

describe("resolveAutoProjectPath", () => {
  test("uses slug when free", () => {
    expect(resolveAutoProjectPath("/home/u", "my-app", () => false)).toBe(
      "/home/u/AnyLM-Projects/my-app"
    );
  });
  test("suffixes on collision", () => {
    const exists = (p: string) => p.endsWith("/my-app");
    expect(resolveAutoProjectPath("/home/u", "my-app", exists)).toBe(
      "/home/u/AnyLM-Projects/my-app-2"
    );
  });
});

describe("ensureWorkspaceForCoding", () => {
  test("returns existing without create", () => {
    const mkdirCalls: string[] = [];
    const r = ensureWorkspaceForCoding({
      get: () => "/existing",
      set: (root) => root,
      home: "/home/u",
      mkdir: (p) => mkdirCalls.push(p),
      exists: () => false,
      text: "Create a React app",
    });
    expect(r).toEqual({ root: "/existing", created: false });
    expect(mkdirCalls).toEqual([]);
  });
  test("creates under AnyLM-Projects when unset", () => {
    let current: string | null = null;
    const mkdirCalls: string[] = [];
    const r = ensureWorkspaceForCoding({
      get: () => current,
      set: (root) => {
        current = root;
        return root;
      },
      home: "/home/u",
      mkdir: (p) => mkdirCalls.push(p),
      exists: () => false,
      text: "Create a React Student List app",
    });
    expect(r.created).toBe(true);
    expect(r.root).toBe("/home/u/AnyLM-Projects/create-a-react-student-list-app");
    expect(mkdirCalls).toContain("/home/u/AnyLM-Projects");
    expect(mkdirCalls).toContain(r.root);
    expect(current).toBe(r.root);
  });
});
