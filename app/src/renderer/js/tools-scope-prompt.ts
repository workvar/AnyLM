import { el } from "./dom.js";

export type ToolsScopeChoice = "all-new" | "this-chat" | "cancel";

let resolver: ((value: ToolsScopeChoice) => void) | null = null;

function done(value: ToolsScopeChoice) {
  el("tools-scope-modal").classList.add("hidden");
  const r = resolver;
  resolver = null;
  if (r) r(value);
}

export function promptToolsScope(kind: "enable" | "disable-default"): Promise<ToolsScopeChoice> {
  const title = el("tools-scope-title");
  const sub = el("tools-scope-sub");
  if (kind === "enable") {
    title.textContent = "Keep tools enabled for…?";
    sub.textContent =
      "You can turn tools on for this chat only, or make them the default for new non-project chats.";
  } else {
    title.textContent = "Turn tools off for…?";
    sub.textContent =
      "Clear the default for new non-project chats, or turn tools off only in this chat.";
  }
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
