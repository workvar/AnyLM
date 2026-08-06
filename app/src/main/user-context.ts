// "Customize": the personal context the user wants applied to every chat,
// in every project. Project instructions still stack on top of it.
import * as settings from "./settings";

const FIELDS: Array<[keyof UserContext, string]> = [
  ["about", "About the user"],
  ["work", "What they work on"],
  ["style", "How they want replies written"],
  ["extra", "Anything else to keep in mind"],
];

function get(): UserContext {
  const saved: Partial<UserContext> = settings.read().userContext || {};
  return {
    enabled: saved.enabled !== false,
    name: String(saved.name || ""),
    about: String(saved.about || ""),
    work: String(saved.work || ""),
    style: String(saved.style || ""),
    extra: String(saved.extra || ""),
  };
}

function set(patch: Partial<UserContext>): UserContext {
  settings.write({ userContext: { ...get(), ...patch } });
  return get();
}

// System-prompt block, or "" when Customize is empty or switched off.
function promptBlock(): string {
  const ctx = get();
  if (!ctx.enabled) return "";
  const lines: string[] = [];
  if (ctx.name.trim()) lines.push(`Their name is ${ctx.name.trim()}.`);
  for (const [key, label] of FIELDS) {
    const value = String(ctx[key] || "").trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  if (!lines.length) return "";
  return `About the person you are talking to (applies to every chat):\n\n${lines.join("\n")}`;
}

export { get, set, promptBlock };
