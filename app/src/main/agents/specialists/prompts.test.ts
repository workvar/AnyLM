import { expect, test } from "bun:test";
import { specialistPrompt } from "./prompts";

test("research prompt forbids pasting full pages", () => {
  expect(specialistPrompt("research")).toMatch(/sources/i);
});

test("fact_check prompt requires supported disputed unknown", () => {
  expect(specialistPrompt("fact_check")).toMatch(/disputed/i);
});
