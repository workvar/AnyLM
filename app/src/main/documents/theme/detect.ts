// Tone → theme. Scores keyword hits in the document's own text, so a research
// paper gets the serif treatment and a launch deck gets the loud one without
// the user choosing anything.
import { DEFAULT_THEME, THEME_IDS, type ThemeId } from "./tokens";

const SIGNALS: Record<ThemeId, RegExp[]> = {
  academic: [
    /\babstract\b/gi, /\bliterature review\b/gi, /\bhypothes[ei]s\b/gi,
    /\bmethodolog/gi, /\bet al\b/gi, /\bcitations?\b/gi, /\bpeer[- ]review/gi,
    /\bthesis\b/gi, /\bdissertation\b/gi, /\bresearch question/gi,
    /\bempirical\b/gi, /\bp[- ]value\b/gi, /\bsample size\b/gi,
    /\bbibliograph/gi, /\bjournal\b/gi, /\bsyllabus\b/gi, /\blecture\b/gi,
  ],
  professional: [
    /\brevenue\b/gi, /\bquarterly\b/gi, /\bq[1-4]\b/gi, /\bboard\b/gi,
    /\bstakeholder/gi, /\broadmap\b/gi, /\bkpis?\b/gi, /\bforecast/gi,
    /\bbudget/gi, /\bcompliance\b/gi, /\bclients?\b/gi, /\bproposal\b/gi,
    /\broi\b/gi, /\bmarket share\b/gi, /\bexecutive summary\b/gi,
    /\binvestors?\b/gi, /\bheadcount\b/gi, /\bsla\b/gi, /\bportfolio\b/gi,
    /\benterprise\b/gi, /\bstrateg/gi,
  ],
  vibrant: [
    /\blaunch/gi, /\bparty\b/gi, /\bcelebrat/gi, /\bwelcome aboard\b/gi,
    /\boffsite\b/gi, /\bhackathon\b/gi, /\bcampaign\b/gi, /\bbrand\b/gi,
    /\bsocial media\b/gi, /\bfun\b/gi, /\bgames?\b/gi, /\bquiz\b/gi,
    /\bbirthday\b/gi, /\bkick[- ]?off\b/gi, /\bannounce/gi,
  ],
  informal: [
    /\bquick note\b/gi, /\bheads up\b/gi, /\bfyi\b/gi, /\bstand[- ]?up\b/gi,
    /\bweekly update\b/gi, /\bchecklist\b/gi, /\bgrocer/gi, /\bto[- ]?dos?\b/gi,
    /\brecipe\b/gi, /\bpacking list\b/gi, /\breminders?\b/gi, /\bpersonal\b/gi,
  ],
};

export interface Detection {
  id: ThemeId;
  confidence: number;
  /** True when the caller should not trust the pick without asking. */
  ambiguous: boolean;
}

const FLOOR = 0.45;

export function detectTheme(text: unknown): Detection {
  const s = String(text || "");
  if (!s.trim()) return { id: DEFAULT_THEME, confidence: 0, ambiguous: true };

  const scores = {} as Record<ThemeId, number>;
  let total = 0;
  for (const id of THEME_IDS) {
    scores[id] = SIGNALS[id].reduce((n, re) => n + (s.match(re) || []).length, 0);
    total += scores[id];
  }
  if (total === 0) return { id: DEFAULT_THEME, confidence: 0, ambiguous: true };

  const ranked = THEME_IDS.slice().sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0];
  const lead = scores[best] - scores[ranked[1]];
  const confidence =
    Math.round(Math.min(1, (scores[best] / total) * (0.5 + (0.5 * Math.min(lead, 4)) / 4)) * 100) / 100;

  return { id: best, confidence, ambiguous: confidence < FLOOR };
}
