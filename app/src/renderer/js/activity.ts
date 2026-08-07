// Per-conversation activity, shown as a dot on the sidebar entry.
//
//   working — the model is generating; a pulsing accent dot
//   waiting — the model asked a question and cannot continue; an amber dot
import { state } from "./state.js";

type Status = "working" | "waiting";

const status = new Map<string, Status>();
const titles = new Map<string, string>();

export function activeKey(): string | null {
  if (state.mode === "chat" && state.current) return `chat:${state.current.id}`;
  if (state.mode === "project" && state.thread) return `thread:${state.thread.id}`;
  return null;
}

export function getActivity(key: string): Status | null {
  return status.get(key) || null;
}

export function anyWorking(): boolean {
  return status.size > 0;
}

export function listActivity(): { key: string; status: Status; title: string }[] {
  const out: { key: string; status: Status; title: string }[] = [];
  for (const [key, value] of status) {
    out.push({ key, status: value, title: titles.get(key) || key });
  }
  return out;
}

export function paintActivity(): void {
  if (typeof document === "undefined") return;
  for (const row of document.querySelectorAll<HTMLElement>("[data-conv-key]")) {
    const s = status.get(row.dataset.convKey || "");
    row.classList.toggle("is-working", s === "working");
    row.classList.toggle("is-waiting", s === "waiting");
  }
}

export function setActivity(key: string, value: Status, title?: string): void {
  if (!key) return;
  status.set(key, value);
  if (title) titles.set(key, title);
  paintActivity();
}

export function clearActivity(key: string): void {
  if (!key) return;
  status.delete(key);
  titles.delete(key);
  paintActivity();
}

export function notifyWaiting(_key: string, _question: string): void {
  // Desktop notification hook — wired when notifyAttention lands on the API.
}
