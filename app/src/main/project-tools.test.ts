import { describe, expect, test } from "bun:test";
import { applyProjectDefaultUseTools } from "./project-tools";

function sampleProject(): Project {
  return {
    id: "p1",
    name: "Demo",
    instructions: "",
    model: "m",
    folderPath: "",
    contexts: [],
    archived: false,
    importGeneral: false,
    exportToGeneral: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    threads: [
      {
        id: "t1",
        title: "A",
        folderId: null,
        messages: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        useTools: false,
      },
      {
        id: "t2",
        title: "B",
        folderId: null,
        messages: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        archived: true,
        useTools: true,
      },
    ],
  };
}

describe("applyProjectDefaultUseTools", () => {
  test("turns on default and all threads including archived", () => {
    const p = applyProjectDefaultUseTools(sampleProject(), true);
    expect(p.defaultUseTools).toBe(true);
    expect(p.threads!.every((t) => t.useTools === true)).toBe(true);
  });

  test("turns off default and all threads", () => {
    const p = applyProjectDefaultUseTools(sampleProject(), false);
    expect(p.defaultUseTools).toBe(false);
    expect(p.threads!.every((t) => t.useTools === false)).toBe(true);
  });

  test("handles missing threads array", () => {
    const base = sampleProject();
    delete (base as { threads?: ProjectThread[] }).threads;
    const p = applyProjectDefaultUseTools(base, true);
    expect(p.defaultUseTools).toBe(true);
    expect(p.threads || []).toEqual([]);
  });
});
