// src/renderer/js/web-research-hint.ts
import { el } from "./dom.js";
import { hasHttpUrl } from "./has-http-url.js";
import { state } from "./state.js";
import { setUseTools } from "./tools-toggle.js";

const SKILL_ID = "web-research";

function shouldShowWebResearchHint(opts: {
  text: string;
  globalEnabled: boolean;
  skillOverrides: string[] | null | undefined;
  dismissed: boolean;
}): boolean {
  if (opts.dismissed) return false;
  if (opts.globalEnabled) return false;
  if ((opts.skillOverrides || []).includes(SKILL_ID)) return false;
  return hasHttpUrl(opts.text);
}

function nextWebResearchHintDismissed(dismissed: boolean, text: string): boolean {
  return hasHttpUrl(text) ? dismissed : false;
}

let dismissed = false;
let bound = false;

function currentOverrides(): string[] {
  if (state.mode === "chat") return state.current?.skillOverrides || [];
  if (state.mode === "project") return state.thread?.skillOverrides || [];
  return [];
}

async function isGlobalWebResearchEnabled(): Promise<boolean> {
  const skills = await window.api.skillsList();
  const skill = skills.find((item) => item.id === SKILL_ID);
  return !!skill?.enabled;
}

type ConversationPatch = {
  skillOverrides?: string[];
  useTools?: boolean;
};

async function persistPatch(patch: ConversationPatch): Promise<void> {
  if (state.mode === "chat" && state.current) {
    state.current = { ...state.current, ...patch };
    await window.api.updateChat(state.current.id, patch);
  } else if (state.mode === "project" && state.current && state.thread) {
    state.thread = { ...state.thread, ...patch };
    await window.api.updateThread(state.current.id, state.thread.id, patch);
  }
}

async function syncWebResearchHint(): Promise<void> {
  const host = el("web-research-hint");
  if (!host) return;

  const input = el("chat-input");
  const globalEnabled = await isGlobalWebResearchEnabled();
  const show = shouldShowWebResearchHint({
    text: input?.value || "",
    globalEnabled,
    skillOverrides: currentOverrides(),
    dismissed,
  });
  host.classList.toggle("hidden", !show);
  if (!show || host.dataset.ready) return;

  const message = document.createElement("span");
  message.textContent = "This looks like a link — enable Web research?";

  const actions = document.createElement("span");
  actions.className = "hint-actions";

  const enable = document.createElement("button");
  enable.type = "button";
  enable.className = "primary-hint";
  enable.textContent = "Enable";
  enable.onclick = async () => {
    const next = [...new Set([...currentOverrides(), SKILL_ID])];
    await persistPatch({ skillOverrides: next, useTools: true });
    setUseTools(true, { persist: false });
    dismissed = false;
    await syncWebResearchHint();
  };

  const keep = document.createElement("button");
  keep.type = "button";
  keep.textContent = "Keep enabled";
  keep.onclick = async () => {
    await window.api.skillsToggle(SKILL_ID, true);
    const next = currentOverrides().filter((id) => id !== SKILL_ID);
    await persistPatch({ skillOverrides: next, useTools: true });
    setUseTools(true, { persist: false });
    dismissed = false;
    await syncWebResearchHint();
  };

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "hint-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "✕";
  dismiss.onclick = async () => {
    dismissed = true;
    await syncWebResearchHint();
  };

  actions.append(enable, keep, dismiss);
  host.append(message, actions);
  host.dataset.ready = "1";
}

function initWebResearchHint(): void {
  if (bound) return;
  bound = true;

  const input = el("chat-input");
  input.addEventListener("input", () => {
    dismissed = nextWebResearchHintDismissed(dismissed, input.value);
    void syncWebResearchHint();
  });
  input.addEventListener("paste", () => {
    queueMicrotask(() => void syncWebResearchHint());
  });
  void syncWebResearchHint();
}

function resetWebResearchHintDismiss(): void {
  dismissed = false;
  void syncWebResearchHint();
}

export {
  shouldShowWebResearchHint,
  nextWebResearchHintDismissed,
  SKILL_ID,
  initWebResearchHint,
  syncWebResearchHint,
  resetWebResearchHintDismiss,
};
