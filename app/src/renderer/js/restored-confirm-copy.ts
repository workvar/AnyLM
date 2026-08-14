// Wording for a confirmation that is offered again after the fact.
// Pure so the copy can be tested without a DOM.

const TOOL_TITLES: Record<string, string> = {
  generate_document: "Create a file in your folder?",
  run_shell: "Run a terminal command?",
  open_app_or_url: "Open an app or link?",
  write_file: "Write a file?",
  delete_path: "Delete a path?",
  move_path: "Move a path?",
  copy_path: "Copy a path?",
  http_fetch: "Send a web request?",
};

export function restoredTitle(record: PendingConfirmRecord): string {
  return TOOL_TITLES[record.toolName] || `Run ${record.toolName}?`;
}

/** Short description of what the call would do. */
export function restoredDetail(record: PendingConfirmRecord): string {
  const args = record.args || {};
  if (record.toolName === "generate_document") {
    const fmt = String(args.format || "pdf").toLowerCase().replace(/^\./, "");
    return `${args.title || "document"}.${fmt || "pdf"}`;
  }
  const first = Object.values(args).find((v) => typeof v === "string" && v.trim());
  return first ? String(first) : record.toolDescription || record.toolName;
}

/** Human age of the request, so an old offer does not look like a live one. */
export function restoredWhen(createdAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (mins < 1) return "Asked just now";
  if (mins < 60) return `Asked ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Asked ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Asked ${days} day${days === 1 ? "" : "s"} ago`;
}
