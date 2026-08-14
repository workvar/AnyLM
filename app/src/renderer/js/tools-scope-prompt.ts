import { el } from "./dom.js";

export type ToolsScopeChoice = "all-new" | "this-chat" | "cancel";
export type ToolsScopeKind = "enable" | "disable";
export type ToolsScopeMode = "chat" | "project";

let resolver: ((value: ToolsScopeChoice) => void) | null = null;

function done(value: ToolsScopeChoice) {
  el("tools-scope-modal").classList.add("hidden");
  const r = resolver;
  resolver = null;
  if (r) r(value);
}

const COPY = {
  chat: {
    here: "Only this chat",
    future: "All new chats",
    enable: "Turn tools on for this chat only, or make them the default for new chats.",
    disable: "Turn tools off for this chat only, or make that the default for new chats.",
  },
  project: {
    here: "Only this thread",
    future: "All new threads here",
    enable:
      "Turn tools on for this thread only, or make them the default for new threads in this project.",
    disable:
      "Turn tools off for this thread only, or make that the default for new threads in this project.",
  },
} as const;

export function promptToolsScope(
  kind: ToolsScopeKind,
  mode: ToolsScopeMode = "chat"
): Promise<ToolsScopeChoice> {
  const copy = COPY[mode];
  el("tools-scope-title").textContent =
    kind === "enable" ? "Turn tools on for…?" : "Turn tools off for…?";
  el("tools-scope-sub").textContent = copy[kind];
  el("tools-scope-this").textContent = copy.here;
  el("tools-scope-all").textContent = copy.future;
  el("tools-scope-modal").classList.remove("hidden");
  return new Promise((res) => {
    resolver = res;
  });
}

export function initToolsScopePrompt() {
  el("tools-scope-all").onclick = () => done("all-new");
  el("tools-scope-this").onclick = () => done("this-chat");
  el("tools-scope-cancel").onclick = () => done("cancel");
  el("tools-scope-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "tools-scope-modal") done("cancel");
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && resolver) {
      e.preventDefault();
      done("cancel");
    }
  });
}
