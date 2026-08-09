import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { track } from "./analytics";

describe("analytics.track", () => {
  it("does not throw when gtag is missing", () => {
    assert.doesNotThrow(() => track("download_clicked", { source: "test" }));
  });
});
