import { describe, expect, test, beforeEach } from "bun:test";

// activity.ts imports state.js which needs DOM-ish globals in some paths;
// we test listActivity via a thin re-export pattern by resetting maps through API.

import {
  setActivity,
  clearActivity,
  listActivity,
  getActivity,
} from "./activity.js";

describe("listActivity", () => {
  beforeEach(() => {
    for (const e of listActivity()) clearActivity(e.key);
  });

  test("returns entries with titles", () => {
    setActivity("chat:1", "working", "Alpha");
    setActivity("chat:2", "waiting", "Beta");
    const list = listActivity().sort((a, b) => a.key.localeCompare(b.key));
    expect(list).toEqual([
      { key: "chat:1", status: "working", title: "Alpha" },
      { key: "chat:2", status: "waiting", title: "Beta" },
    ]);
    expect(getActivity("chat:1")).toBe("working");
  });

  test("clear removes entry", () => {
    setActivity("chat:1", "working", "Alpha");
    clearActivity("chat:1");
    expect(listActivity()).toEqual([]);
  });
});
