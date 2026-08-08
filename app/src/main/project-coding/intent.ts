const NOT =
  /\b(what is|what's|how (do|does|can) (i|you)|explain|difference between|why (is|are|do)|tell me about)\b/i;

const SNIPPET_ONLY =
  /\b(show me (a |an )?(small |quick )?(example|snippet)|example snippet|code example)\b/i;

const CREATE =
  /\b(create|scaffold|init|initialize|set up|setup|bootstrap|generate|build)\b/i;

const PROJECT_NOUN =
  /\b(project|app|application|repo|repository|codebase|folder|directory|workspace)\b/i;

const WRITE_CODE =
  /\b(write|add|implement|create|edit|update|fix)\b[\s\S]{0,40}\b(file|component|module|class|function|page|route|endpoint|script|test)\b/i;

const LANG_APP =
  /\b(react|vue|svelte|next\.?js|nuxt|angular|vite|node|express|django|flask|fastapi|rails|laravel|spring|cargo|rust|go|golang|python|typescript|javascript|java|kotlin|swift)\b/i;

export function isProjectCodingIntent(text: string): boolean {
  const s = String(text || "").trim();
  if (!s) return false;
  if (NOT.test(s) && !CREATE.test(s) && !WRITE_CODE.test(s)) return false;
  if (SNIPPET_ONLY.test(s) && !PROJECT_NOUN.test(s) && !WRITE_CODE.test(s)) return false;
  if (CREATE.test(s) && (PROJECT_NOUN.test(s) || LANG_APP.test(s))) return true;
  if (WRITE_CODE.test(s)) return true;
  if (/\b(in the project|working folder|working directory)\b/i.test(s) && LANG_APP.test(s)) return true;
  return false;
}
