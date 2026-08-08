import { describe, expect, test } from "bun:test";
import { slugFromText } from "./slug";

describe("slugFromText", () => {
  test("basic words", () => {
    expect(slugFromText("Create a React Student List app")).toBe("create-a-react-student-list-app");
  });
  test("strips junk and collapses hyphens", () => {
    expect(slugFromText("Hello!!! My_App@@@")).toBe("hello-my-app");
  });
  test("truncates to 48", () => {
    const s = slugFromText("a".repeat(80));
    expect(s.length).toBeLessThanOrEqual(48);
  });
  test("empty falls back", () => {
    expect(slugFromText("???")).toBe("project");
  });
});
