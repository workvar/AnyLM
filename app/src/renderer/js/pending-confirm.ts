// When to clear turn.pendingConfirm after a tool finishes.
// Parallel workers can complete an earlier same-name tool while a newer
// confirm is still waiting — matching on tool name alone would hide Allow/Deny.

type PendingConfirm = {
  tool?: { name?: string } | null;
};

type ToolDoneEv = {
  kind: string;
  status?: string;
  name?: string;
  output?: string;
};

const DECLINED = "declined to run this tool";

/** True when this tool-done means the outstanding confirm was denied/timed out. */
export function shouldClearPendingOnToolDone(
  pending: PendingConfirm | null | undefined,
  ev: ToolDoneEv
): boolean {
  if (!pending) return false;
  if (ev.kind !== "tool" || ev.status !== "done") return false;
  if (ev.name !== pending.tool?.name) return false;
  return typeof ev.output === "string" && ev.output.toLowerCase().includes(DECLINED);
}
