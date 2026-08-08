// Policy for risky-tool confirms in the Working strip.
// generate_document also uses the inline file-card UI, but it must still expose
// Allow/Deny on the strip — otherwise approval is easy to miss and the 2-minute
// auto-deny records "The user declined to run this tool."

type PendingConfirm = {
  token: string;
  tool?: { name?: string } | null;
};

/** Token shown on the Working strip Allow/Deny controls, if any. */
export function openConfirmToken(pending: PendingConfirm | null | undefined): string | undefined {
  return pending?.token || undefined;
}

/** Label while a confirm is the newest actionable activity event. */
export function waitingConfirmLabel(_ev: {
  label?: string;
  tool?: { name?: string } | null;
}): string {
  return "Waiting for approval…";
}
