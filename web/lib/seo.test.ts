import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DESCRIPTION } from "./config";
import { SITE_URL, getVerification, buildSoftwareJsonLd, DEFAULT_DESCRIPTION } from "./seo";

describe("seo", () => {
  it("SITE_URL has no trailing slash", () => {
    assert.equal(SITE_URL.endsWith("/"), false);
    assert.match(SITE_URL, /^https?:\/\//);
  });

  it("DESCRIPTION fits search and social preview limits", () => {
    assert.ok(DESCRIPTION.length > 40);
    assert.ok(
      DESCRIPTION.length <= 155,
      `DESCRIPTION is ${DESCRIPTION.length} chars; keep ≤155 for search snippets`,
    );
    assert.ok(
      DESCRIPTION.length <= 125,
      `DESCRIPTION is ${DESCRIPTION.length} chars; keep ≤125 for OG previews`,
    );
  });

  it("getVerification omits empty ids", () => {
    const v = getVerification();
    if (!process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION) {
      assert.equal(v.google, undefined);
    }
    if (!process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION) {
      assert.equal(v.other, undefined);
    }
  });

  it("buildSoftwareJsonLd includes name and url", () => {
    const ld = buildSoftwareJsonLd();
    assert.equal(ld["@type"], "SoftwareApplication");
    assert.equal(ld.name, "AnyLM");
    assert.equal(ld.url, SITE_URL);
    assert.ok(typeof DEFAULT_DESCRIPTION === "string" && DEFAULT_DESCRIPTION.length > 20);
  });
});
