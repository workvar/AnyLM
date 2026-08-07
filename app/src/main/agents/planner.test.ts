import { describe, expect, test } from "bun:test";
import { planTurn } from "./planner";

test("planTurn returns plan from generate", async () => {
  const plan = await planTurn({
    model: "x",
    userText: "Do A and B",
    generate: async () =>
      JSON.stringify({
        steps: [
          { id: "1", goal: "Do A", dependsOn: [], kind: "tool" },
          { id: "2", goal: "Do B", dependsOn: [], kind: "tool" },
        ],
      }),
  });
  expect(plan?.steps.length).toBe(2);
});

test("planTurn repairs once then null", async () => {
  let n = 0;
  const plan = await planTurn({
    model: "x",
    userText: "x",
    generate: async () => {
      n += 1;
      return n === 1 ? "NOT JSON" : "STILL BAD";
    },
  });
  expect(plan).toBeNull();
  expect(n).toBe(2);
});
