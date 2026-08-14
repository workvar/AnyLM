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
  test("sets the default without rewriting threads that already chose", () => {
    const p = applyProjectDefaultUseTools(sampleProject(), true);
    expect(p.defaultUseTools).toBe(true);
    expect(p.threads!.map((t) => t.useTools)).toEqual([false, true]);
  });

  test("turning the default off leaves explicit thread choices alone", () => {
    const p = applyProjectDefaultUseTools(sampleProject(), false);
    expect(p.defaultUseTools).toBe(false);
    expect(p.threads!.map((t) => t.useTools)).toEqual([false, true]);
  });

  test("backfills threads with no stored choice from the default", () => {
    const base = sampleProject();
    delete (base.threads![0] as { useTools?: boolean }).useTools;
    const p = applyProjectDefaultUseTools(base, true);
    expect(p.threads!.map((t) => t.useTools)).toEqual([true, true]);
  });

  test("handles missing threads array", () => {
    const base = sampleProject();
    delete (base as { threads?: ProjectThread[] }).threads;
    const p = applyProjectDefaultUseTools(base, true);
    expect(p.defaultUseTools).toBe(true);
    expect(p.threads || []).toEqual([]);
  });
});
