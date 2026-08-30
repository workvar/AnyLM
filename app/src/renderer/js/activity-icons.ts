// One small glyph per tool family, so a glance at the trail says what kind of
// work is happening (reading, writing, shell, network) before the words do.
import { node } from "./dom.js";

const PATHS: Record<string, string> = {
  read: "M4 2.5h5.5L13 6v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Zm5 .8V6h2.7",
  search: "M7.2 2.6a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Zm3.5 8.1 2.8 2.8",
  write: "M3 13h10M4.5 10.6l6-6a1.3 1.3 0 0 1 1.9 1.9l-6 6-2.6.7.7-2.6Z",
  delete: "M3.5 4.5h9m-7 0V3.2h5v1.3m-6 0 .6 8.3h5.8l.6-8.3",
  document: "M4 2.5h5.5L13 6v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Zm1.6 6.2h4.8m-4.8 2.4h3.2",
  shell: "M2.5 3.5h11v9h-11zM5 6.6l1.9 1.9L5 10.4m3.9 0h3",
  network: "M8 2.2a5.8 5.8 0 1 0 0 11.6A5.8 5.8 0 0 0 8 2.2Zm-5.8 5.8h11.6M8 2.2c1.6 1.6 2.4 3.6 2.4 5.8S9.6 12.2 8 13.8c-1.6-1.6-2.4-3.6-2.4-5.8S6.4 3.8 8 2.2Z",
  ask: "M6 6a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.5M8 12.1h.01",
  clock: "M8 2.6a5.4 5.4 0 1 0 0 10.8A5.4 5.4 0 0 0 8 2.6ZM8 5.2V8l2 1.4",
  tool: "M8 2.8 13 5.6v4.8L8 13.2 3 10.4V5.6Z",
};

/** Inline SVG for a tool family; falls back to a generic tool glyph. */
export function iconFor(kind: string): HTMLElement {
  const wrap = node("span", "act-icon");
  wrap.innerHTML =
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" ` +
    `stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${PATHS[kind] || PATHS.tool}"/></svg>`;
  return wrap;
}

// Duplicated from main/activity-labels.ts on purpose: the renderer must be able
// to draw an icon for an event that arrived before (or without) a kind field.
const KINDS: Record<string, string> = {
  read_file: "read",
  list_directory: "read",
  find_files: "search",
  web_search: "search",
  http_fetch: "network",
  write_file: "write",
  create_directory: "write",
  create_project: "write",
  move_path: "write",
  copy_path: "write",
  delete_path: "delete",
  generate_document: "document",
  run_shell: "shell",
  open_app_or_url: "shell",
  ask_user: "ask",
  get_time: "clock",
};

export function kindOf(toolName: string): string {
  return KINDS[toolName] || "tool";
}
