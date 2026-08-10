import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_GENERATE_NUDGE,
  isResearchOnlyRound,
  shouldNudgeDocumentGenerate,
  recordToolRound,
  type DocNudgeState,
} from "./doc-nudge";

function base(over: Partial<DocNudgeState> = {}): DocNudgeState {
  return {
    documentIntent: true,
    researchOnlyRounds: 0,
    attemptedGenerate: false,
    nudged: false,
    ...over,
  };
}

describe("doc nudge", () => {
  test("research-only round detection", () => {
    expect(isResearchOnlyRound(["web_search"])).toBe(true);
    expect(isResearchOnlyRound(["web_search", "http_fetch"])).toBe(true);
    expect(isResearchOnlyRound(["http_fetch", "generate_document"])).toBe(false);
    expect(isResearchOnlyRound([])).toBe(false);
  });

  test("no nudge before 2 research-only rounds", () => {
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 0 }))).toBe(false);
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 1 }))).toBe(false);
  });

  test("nudge at 2 when document intent and not yet nudged", () => {
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2 }))).toBe(true);
    expect(DOCUMENT_GENERATE_NUDGE).toMatch(/generate_document/);
  });

  test("suppress when no document intent, already nudged, or generate attempted", () => {
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2, documentIntent: false }))).toBe(false);
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2, nudged: true }))).toBe(false);
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2, attemptedGenerate: true }))).toBe(false);
  });

  test("recordToolRound increments and flags generate", () => {
    let s = base();
    s = recordToolRound(s, ["web_search"]);
    expect(s.researchOnlyRounds).toBe(1);
    s = recordToolRound(s, ["http_fetch"]);
    expect(s.researchOnlyRounds).toBe(2);
    s = recordToolRound(s, ["generate_document"]);
    expect(s.attemptedGenerate).toBe(true);
    expect(s.researchOnlyRounds).toBe(2); // unchanged when not research-only
  });
});
