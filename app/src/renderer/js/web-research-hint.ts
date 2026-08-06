// src/renderer/js/web-research-hint.ts
import { el } from "./dom.js";
import { hasHttpUrl } from "./has-http-url.js";
import { refreshSkills } from "./rail/index.js";
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

function nextWebResearchSkillOverrides(
  overrides: string[],
  keepGlobally: boolean
): string[] {
  if (keepGlobally) return overrides.filter((id) => id !== SKILL_ID);
  return [...new Set([...overrides, SKILL_ID])];
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

type ConversationTarget =
  | { mode: "chat"; chatId: string; overrides: string[] }
  | { mode: "project"; projectId: string; threadId: string; overrides: string[] };

function captureConversationTarget(): ConversationTarget | null {
  if (state.mode === "chat" && state.current) {
    return {
      mode: "chat",
      chatId: state.current.id,
      overrides: [...(state.current.skillOverrides || [])],
    };
  }
  if (state.mode === "project" && state.current && state.thread) {
    return {
      mode: "project",
      projectId: state.current.id,
      threadId: state.thread.id,
      overrides: [...(state.thread.skillOverrides || [])],
    };
  }
  return null;
}

function isCurrentTarget(target: ConversationTarget): boolean {
  if (target.mode === "chat") {
    return state.mode === "chat" && state.current?.id === target.chatId;
  }
  return (
    state.mode === "project" &&
    state.current?.id === target.projectId &&
    state.thread?.id === target.threadId
  );
}

async function persistPatchFor(
  target: ConversationTarget,
  patch: ConversationPatch
): Promise<void> {
  if (target.mode === "chat") {
    if (isCurrentTarget(target)) state.current = { ...state.current, ...patch };
    await window.api.updateChat(target.chatId, patch);
  } else {
    if (isCurrentTarget(target)) state.thread = { ...state.thread, ...patch };
    await window.api.updateThread(target.projectId, target.threadId, patch);
  }
}

function ensureWebResearchHint(host: UiElement): void {
  if (host.dataset.ready) return;
  host.dataset.ready = "1";
  const message = document.createElement("span");
  message.textContent = "This looks like a link — enable Web research?";

  const actions = document.createElement("span");
  actions.className = "hint-actions";

  const enable = document.createElement("button");
  enable.type = "button";
  enable.className = "primary-hint";
  enable.textContent = "Enable";
  enable.onclick = async () => {
    const target = captureConversationTarget();
    if (!target) return;
    const next = nextWebResearchSkillOverrides(target.overrides, false);
    await persistPatchFor(target, { skillOverrides: next, useTools: true });
    if (isCurrentTarget(target)) {
      setUseTools(true, { persist: false });
      dismissed = false;
    }
    await syncWebResearchHint();
  };

  const keep = document.createElement("button");
  keep.type = "button";
  keep.textContent = "Keep enabled";
  keep.onclick = async () => {
    const target = captureConversationTarget();
    if (!target) return;
    const next = nextWebResearchSkillOverrides(target.overrides, true);
    await window.api.skillsToggle(SKILL_ID, true);
    await refreshSkills();
    await persistPatchFor(target, { skillOverrides: next, useTools: true });
    if (isCurrentTarget(target)) {
      setUseTools(true, { persist: false });
      dismissed = false;
    }
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
}

async function syncWebResearchHint(): Promise<void> {
  const host = el("web-research-hint");
  if (!host) return;

  const input = el("chat-input");
  const text = input?.value || "";
  if (!hasHttpUrl(text)) {
    host.classList.add("hidden");
    return;
  }

  ensureWebResearchHint(host);
  const globalEnabled = await isGlobalWebResearchEnabled();
  const show = shouldShowWebResearchHint({
    text: input?.value || "",
    globalEnabled,
    skillOverrides: currentOverrides(),
    dismissed,
  });
  host.classList.toggle("hidden", !show);
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
  nextWebResearchSkillOverrides,
  SKILL_ID,
  initWebResearchHint,
  syncWebResearchHint,
  resetWebResearchHintDismiss,
};
