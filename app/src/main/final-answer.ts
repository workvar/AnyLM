// A tool-calling turn can end with nothing to show the user.
//
// Two ways it happens: the model spends its last round emitting tool calls and
// hits the round cap (the loop breaks before it ever writes prose), or it
// simply returns an empty message after a tool result. Either way the renderer
// falls back to "(stopped before any reply)" — the work happened, and none of
// it reached the user.
//
// The fix is a final pass with the tools taken away, so the only thing the
// model can do is answer.

/** Hard ceiling on tool rounds in one turn. */
export const MAX_TOOL_ROUNDS = 15;

export interface FinalAnswerCheck {
  /** Text the model produced on its last round. */
  text: string;
  /** The user stopped the turn — respect that, do not generate more. */
  stopped: boolean;
  /** Tool rounds ran, so there is material to answer from. */
  toolsRun: number;
  /** The loop broke on MAX_TOOL_ROUNDS rather than on "no more tool calls". */
  hitRoundCap: boolean;
}

/** Whether to spend one more (tool-free) call getting the user a reply. */
export function needsFinalAnswer(c: FinalAnswerCheck): boolean {
  if (c.stopped) return false;
  if (c.toolsRun <= 0) return false;
  return !c.text.trim() || c.hitRoundCap;
}

/** System message for that pass. */
export function finalAnswerPrompt(hitRoundCap: boolean): string {
  return (
    (hitRoundCap
      ? `You have used the maximum of ${MAX_TOOL_ROUNDS} tool rounds for this turn. No further tool calls are possible. `
      : "You ended your last turn without saying anything to the user. ") +
    "Answer now, in prose, using the tool results already in this conversation. " +
    "Do not emit any tool call or tool JSON. " +
    "If a tool you needed failed or a fact is still unverified, say so plainly and give " +
    "the user your best answer anyway — an incomplete answer is far better than silence."
  );
}
