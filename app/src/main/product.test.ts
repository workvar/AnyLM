// app/src/main/product.test.ts
import { describe, expect, test } from "bun:test";
import { PRODUCT_NAME, productDisplayName } from "./product";

describe("productDisplayName", () => {
  test("packaged is AnyLM", () => {
    expect(productDisplayName(true)).toBe("AnyLM");
  });

  test("unpackaged is AnyLM (Dev)", () => {
    expect(productDisplayName(false)).toBe("AnyLM (Dev)");
  });

  test("PRODUCT_NAME stays AnyLM", () => {
    expect(PRODUCT_NAME).toBe("AnyLM");
  });
});
