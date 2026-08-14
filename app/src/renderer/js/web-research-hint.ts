// src/renderer/js/web-research-hint.ts
import {
  captureConversationTarget,
  isCurrentTarget,
  persistConversationPatch,
  targetOverrides,
  type ConversationTarget,
} from "./conversation-target.js";
import { el } from "./dom.js";
import { hasHttpUrl } from "./has-http-url.js";
import { refreshSkills } from "./rail/index.js";
import { state } from "./state.js";
import { setConversationUseTools } from "./tools-toggle.js";

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

function nextWebResearchSkillOverrides(overrides: string[], keepGlobally: boolean): string[] {
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

// Enabling the skill also needs tools on. Route that through the same
// per-conversation write path the toggle uses so the button and the stored
// value can never disagree.
async function enableWebResearch(target: ConversationTarget, keepGlobally: boolean): Promise<void> {
  const next = nextWebResearchSkillOverrides(targetOverrides(target), keepGlobally);
  await persistConversationPatch(target, { skillOverrides: next });
  await setConversationUseTools(target, true);
  if (isCurrentTarget(target)) dismissed = false;
  await syncWebResearchHint();
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
    await enableWebResearch(target, false);
  };

  const keep = document.createElement("button");
  keep.type = "button";
  keep.textContent = "Keep enabled";
  keep.onclick = async () => {
    const target = captureConversationTarget();
    if (!target) return;
    await window.api.skillsToggle(SKILL_ID, true);
    await refreshSkills();
    await enableWebResearch(target, true);
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
    text,
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
