import { EventEmitter } from "events";
import { beforeEach, expect, mock, test } from "bun:test";

let spawnError: Error | null = null;
let unref: ReturnType<typeof mock>;

mock.module("child_process", () => ({
  execFileSync: mock(() => "/usr/local/bin/ollama\n"),
  spawn: mock(() => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    unref = mock(() => {});
    child.unref = unref;
    if (spawnError) {
      const error = spawnError;
      process.nextTick(() => child.emit("error", error));
    } else {
      process.nextTick(() => child.emit("spawn"));
    }
    return child;
  }),
}));

mock.module("electron", () => ({
  shell: { openExternal: mock(async () => {}) },
}));

const { spawnPlan } = await import("./runtime");

beforeEach(() => {
  spawnError = null;
});

test("spawnPlan rejects an immediate asynchronous spawn error", async () => {
  spawnError = new Error("spawn ENOENT");

  await expect(spawnPlan({ command: "/missing/ollama", args: ["serve"] })).rejects.toThrow(
    "spawn ENOENT"
  );
});

test("spawnPlan resolves and unreferences a successfully spawned child", async () => {
  await spawnPlan({ command: "/usr/local/bin/ollama", args: ["serve"] });

  expect(unref).toHaveBeenCalledTimes(1);
});
