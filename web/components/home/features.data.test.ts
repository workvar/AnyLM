import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FEATURES } from "./features.data";

describe("FEATURES", () => {
  it("has nine cards for a full 3-column desktop grid", () => {
    assert.equal(FEATURES.length, 9);
    assert.equal(FEATURES.length % 3, 0);
  });

  it("marks cloud backends as upcoming only", () => {
    const upcoming = FEATURES.filter((f) => f.upcoming);
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].title, "Cloud API backends");
  });
});
