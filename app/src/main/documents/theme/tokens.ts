// Design tokens for generated documents. One theme drives every format, so a
// deck, its companion report and its spreadsheet look like one family.
//
// Colours are bare hex (no '#') because pptxgenjs and docx both reject '#'.

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkMuted: string;
  inkInverse: string;
  primary: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  /** Accent variant for use on `primary` backgrounds; plain accent fails contrast there. */
  accentOnDark: string;
  line: string;
  series: string[];
}

export interface TypeScale {
  deckTitle: number;
  deckSubtitle: number;
  slideTitle: number;
  slideKicker: number;
  slideBody: number;
  slideCaption: number;
  docTitle: number;
  docH1: number;
  docH2: number;
  docH3: number;
  docBody: number;
  docCaption: number;
}

export interface Theme {
  id: ThemeId;
  label: string;
  palette: Palette;
  fonts: { heading: string; body: string; mono: string };
  type: TypeScale;
  layout: {
    radius: number;
    cardShadow: boolean;
    docMarginIn: number;
    slideMarginIn: number;
    darkCover: boolean;
    uppercaseKicker: boolean;
  };
}

export type ThemeId = "professional" | "academic" | "vibrant" | "informal";

export const THEME_IDS: ThemeId[] = ["professional", "academic", "vibrant", "informal"];

export const THEMES: Record<ThemeId, Theme> = {
  professional: {
    id: "professional",
    label: "Professional",
    palette: {
      bg: "FFFFFF", surface: "F3F6FA", surfaceAlt: "E7EDF5",
      ink: "111827", inkMuted: "56637A", inkInverse: "FFFFFF",
      primary: "10243E", primaryLight: "2E5E8C", secondary: "3F7CAC",
      accent: "B26A00", accentOnDark: "F0A93B", line: "D3DCE6",
      series: ["10243E", "3F7CAC", "B26A00", "1B7F5A", "6D4C7D", "8A94A6"],
    },
    fonts: { heading: "Cambria", body: "Calibri", mono: "Courier New" },
    type: {
      deckTitle: 40, deckSubtitle: 18, slideTitle: 30, slideKicker: 12,
      slideBody: 15, slideCaption: 10,
      docTitle: 30, docH1: 18, docH2: 14, docH3: 12, docBody: 11, docCaption: 9,
    },
    layout: {
      radius: 6, cardShadow: true, docMarginIn: 1.0, slideMarginIn: 0.6,
      darkCover: true, uppercaseKicker: true,
    },
  },
  academic: {
    id: "academic",
    label: "Academic",
    palette: {
      bg: "FFFFFF", surface: "F6F4EF", surfaceAlt: "EDE9E0",
      ink: "1A1A1A", inkMuted: "5C5952", inkInverse: "FFFFFF",
      primary: "1F3A5F", primaryLight: "3D5A80", secondary: "6E1E23",
      accent: "8A6A1F", accentOnDark: "D9B45B", line: "D8D3C8",
      series: ["1F3A5F", "6E1E23", "8A6A1F", "3F6B4A", "4A4E69", "7D7461"],
    },
    fonts: { heading: "Cambria", body: "Cambria", mono: "Courier New" },
    type: {
      deckTitle: 36, deckSubtitle: 16, slideTitle: 28, slideKicker: 11,
      slideBody: 14, slideCaption: 10,
      docTitle: 26, docH1: 16, docH2: 13, docH3: 12, docBody: 11, docCaption: 9,
    },
    layout: {
      radius: 2, cardShadow: false, docMarginIn: 1.25, slideMarginIn: 0.7,
      darkCover: false, uppercaseKicker: false,
    },
  },
  vibrant: {
    id: "vibrant",
    label: "Vibrant",
    palette: {
      bg: "FFFFFF", surface: "FFF2EF", surfaceAlt: "E8F7F5",
      ink: "1F2430", inkMuted: "5B6273", inkInverse: "FFFFFF",
      primary: "C93129", primaryLight: "D9382F", secondary: "0F8C82",
      accent: "B26A00", accentOnDark: "FFD97A", line: "F0D9D4",
      series: ["C93129", "0F8C82", "B26A00", "5B3E96", "C2255C", "2E6FB7"],
    },
    fonts: { heading: "Arial", body: "Calibri", mono: "Courier New" },
    type: {
      deckTitle: 44, deckSubtitle: 19, slideTitle: 32, slideKicker: 12,
      slideBody: 16, slideCaption: 10,
      docTitle: 32, docH1: 19, docH2: 14, docH3: 12, docBody: 11, docCaption: 9,
    },
    layout: {
      radius: 14, cardShadow: true, docMarginIn: 0.9, slideMarginIn: 0.6,
      darkCover: true, uppercaseKicker: true,
    },
  },
  informal: {
    id: "informal",
    label: "Informal",
    palette: {
      bg: "FFFFFF", surface: "F2F5F1", surfaceAlt: "E6ECE4",
      ink: "1F2A24", inkMuted: "5A6660", inkInverse: "FFFFFF",
      primary: "2F5D46", primaryLight: "4C8064", secondary: "6E8B7B",
      accent: "A9741B", accentOnDark: "F0C46A", line: "D6DED3",
      series: ["2F5D46", "6E8B7B", "A9741B", "3E6B8C", "8C5B6B", "6B7A52"],
    },
    fonts: { heading: "Calibri", body: "Calibri", mono: "Courier New" },
    type: {
      deckTitle: 38, deckSubtitle: 17, slideTitle: 28, slideKicker: 11,
      slideBody: 15, slideCaption: 10,
      docTitle: 26, docH1: 17, docH2: 13, docH3: 12, docBody: 11, docCaption: 9,
    },
    layout: {
      radius: 10, cardShadow: false, docMarginIn: 0.9, slideMarginIn: 0.6,
      darkCover: false, uppercaseKicker: false,
    },
  },
};

export const DEFAULT_THEME: ThemeId = "professional";

export function getTheme(id?: string | null): Theme {
  const key = String(id || "").toLowerCase() as ThemeId;
  return THEMES[key] || THEMES[DEFAULT_THEME];
}
