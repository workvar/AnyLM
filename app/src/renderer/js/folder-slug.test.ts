import { describe, expect, test } from "bun:test";
import { slugFolderName } from "./folder-slug";

test("matches main pathSlug kebab", () => {
  expect(slugFolderName("My Project")).toBe("my-project");
});
