// Guard rails for web_search inside one turn.
//
// Small local models re-ask the same question in slightly different words:
// "Agentic Commerce definition and use cases", "What is Agentic Commerce",
// "Agentic Commerce definition and examples". Each one costs a tool round, and
// the round cap is what eventually ends the turn with nothing written.

/** Most searches one turn may run before we make the model start writing. */
export const MAX_SEARCHES_PER_TURN = 6;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "is", "are",
  "what", "how", "why", "when", "which", "who", "with", "about", "does", "do",
  "best", "top", "guide", "step", "steps", "by",
]);

/**
 * Fingerprint for "the model already asked this". Case, word order, filler
 * words and punctuation are all noise; the content words are the query.
 */
export function searchKey(query: string): string {
  return String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

/** Message returned instead of running a search we should not run. */
export function refuseRepeat(query: string): string {
  return (
    `You already searched for this ("${query}", possibly worded differently) this turn ` +
    "and the results are above. Do not search it again. Either http_fetch one of the URLs " +
    "you already have, search a genuinely different sub-topic, or write your answer now."
  );
}

export function refuseBudget(): string {
  return (
    `You have used all ${MAX_SEARCHES_PER_TURN} searches available this turn. ` +
    "No more searches will run. Use the results and pages you already have to write your " +
    "answer (or call generate_document) now, and note anything you could not verify."
  );
}
