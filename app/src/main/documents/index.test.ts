import { describe, expect, test } from "bun:test";
import { generate } from "./index";
import { THIN_CONTENT_ERROR } from "./content-quality";

describe("generate thin guard", () => {
  test("rejects thin pdf content without writing", async () => {
    await expect(
      generate(null, {
        format: "pdf",
        title: "Metasploit Guide",
        content:
          "# Introduction\n\n# Installing\n1. Step 1: Download\n2. Step 2: Configure\n",
      })
    ).rejects.toThrow(THIN_CONTENT_ERROR);
  });
});
