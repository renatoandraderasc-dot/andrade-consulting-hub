export type ThemeKey = "ofertao" | "economia" | "hortifruti" | "acougue" | "black";

export interface EncarteTheme {
  key: ThemeKey;
  label: string;
  bg: string;
  headerBg: string;
  headerText: string;
  titleText: string;
  splashFill: string;
  splashText: string;
  cardBg: string;
  cardText: string;
  accent: string;
  swatch: string[];
}

export const THEMES: Record<ThemeKey, EncarteTheme> = {
  ofertao: {
    key: "ofertao",
    label: "Ofertão",
    bg: "#FFD400",
    headerBg: "#E3000F",
    headerText: "#FFFFFF",
    titleText: "#111111",
    splashFill: "#E3000F",
    splashText: "#FFFFFF",
    cardBg: "#FFFFFF",
    cardText: "#111111",
    accent: "#E3000F",
    swatch: ["#FFD400", "#E3000F", "#FFFFFF"],
  },
  economia: {
    key: "economia",
    label: "Economia",
    bg: "#E3000F",
    headerBg: "#B00009",
    headerText: "#FFD400",
    titleText: "#FFFFFF",
    splashFill: "#FFD400",
    splashText: "#B00009",
    cardBg: "#FFFFFF",
    cardText: "#111111",
    accent: "#FFD400",
    swatch: ["#E3000F", "#FFD400", "#FFFFFF"],
  },
  hortifruti: {
    key: "hortifruti",
    label: "Hortifruti",
    bg: "#1E8A3C",
    headerBg: "#136126",
    headerText: "#FFF8B0",
    titleText: "#FFFFFF",
    splashFill: "#FFF176",
    splashText: "#136126",
    cardBg: "#FFFFFF",
    cardText: "#111111",
    accent: "#FFF176",
    swatch: ["#1E8A3C", "#FFF176", "#FFFFFF"],
  },
  acougue: {
    key: "acougue",
    label: "Açougue",
    bg: "#5C0E18",
    headerBg: "#3A060D",
    headerText: "#F2B705",
    titleText: "#F6E7C9",
    splashFill: "#F2B705",
    splashText: "#3A060D",
    cardBg: "#F6E7C9",
    cardText: "#3A060D",
    accent: "#F2B705",
    swatch: ["#5C0E18", "#F2B705", "#F6E7C9"],
  },
  black: {
    key: "black",
    label: "Black",
    bg: "#141414",
    headerBg: "#000000",
    headerText: "#FFD400",
    titleText: "#FFD400",
    splashFill: "#FFD400",
    splashText: "#141414",
    cardBg: "#1F1F1F",
    cardText: "#FFFFFF",
    accent: "#FFD400",
    swatch: ["#141414", "#FFD400", "#1F1F1F"],
  },
};

export const FORMATOS = {
  a4: { label: "A4", width: 794, height: 1123 },
  quadrado: { label: "Quadrado", width: 1080, height: 1080 },
  story: { label: "Story", width: 1080, height: 1920 },
} as const;

export type FormatoKey = keyof typeof FORMATOS;
