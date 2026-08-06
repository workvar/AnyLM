// src/renderer/js/web-research-hint.ts
import { hasHttpUrl } from "./has-http-url";

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

export { shouldShowWebResearchHint, SKILL_ID };
