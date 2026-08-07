import { describe, expect, test } from "bun:test";
import { createMutex } from "./mutex";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createMutex", () => {
  test("serializes overlapping calls — never more than one active", async () => {
    const lock = createMutex();
    let active = 0;
    let maxActive = 0;
    const run = (ms: number) =>
      lock(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(ms);
        active -= 1;
        return ms;
      });

    const results = await Promise.all([run(20), run(5), run(10)]);
    expect(maxActive).toBe(1);
    expect(results).toEqual([20, 5, 10]);
  });

  test("preserves call order (FIFO)", async () => {
    const lock = createMutex();
    const order: number[] = [];
    await Promise.all([
      lock(async () => {
        await delay(15);
        order.push(1);
      }),
      lock(async () => {
        await delay(5);
        order.push(2);
      }),
      lock(async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  test("a rejected call does not deadlock later calls", async () => {
    const lock = createMutex();
    const first = lock(async () => {
      throw new Error("boom");
    });
    await expect(first).rejects.toThrow("boom");

    const second = await lock(async () => "ok");
    expect(second).toBe("ok");
  });
});
