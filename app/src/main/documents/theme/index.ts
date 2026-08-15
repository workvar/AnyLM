// Single entry point for theming. Callers pass the document's own text and get
// back a resolved theme; an explicit id always wins over detection.
import { detectTheme } from "./detect";
import { getTheme, type Theme } from "./tokens";

export function resolveTheme(title: unknown, content: unknown, override?: string | null): Theme {
  if (override) return getTheme(override);
  return getTheme(detectTheme(`${String(title || "")}\n${String(content || "")}`).id);
}

// Readable ink for an arbitrary background, by relative luminance.
export function inkOn(bgHex: string, theme: Theme): string {
  const h = bgHex.replace("#", "");
  const chan = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  return lum > 0.35 ? theme.palette.ink : theme.palette.inkInverse;
}

export { detectTheme } from "./detect";
export { getTheme, THEMES, THEME_IDS, DEFAULT_THEME } from "./tokens";
export type { Theme, ThemeId, Palette } from "./tokens";
