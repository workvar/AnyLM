import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SKILLS } from "./capabilities.data";

describe("SKILLS", () => {
  it("pads each group to a multiple of 3 for desktop rows", () => {
    const byGroup = new Map<string, number>();
    for (const s of SKILLS) {
      const g = s.group || "General";
      byGroup.set(g, (byGroup.get(g) || 0) + 1);
    }
    for (const [g, n] of byGroup) {
      assert.equal(n % 3, 0, `${g} has ${n} items`);
    }
  });

  it("labels roadmap items as upcoming", () => {
    const upcoming = SKILLS.filter((s) => s.upcoming);
    assert.ok(upcoming.length >= 3);
    assert.ok(upcoming.every((s) => s.upcoming === true));
  });
});
