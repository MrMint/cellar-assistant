import type { ColorPaletteProp } from "@mui/joy";

export const BANDS = [5, 4, 3, 2, 1, 0] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABELS: Record<number, string> = {
  5: "Outstanding",
  4: "Very Good",
  3: "Good",
  2: "Mediocre",
  1: "Bad",
  0: "Unrated",
};

export const BAND_COLORS: Record<number, string> = {
  5: "#2e7d32",
  4: "#558b2f",
  3: "#f9a825",
  2: "#ef6c00",
  1: "#c62828",
  0: "#757575",
};

export const BAND_JOY_COLORS: Record<number, ColorPaletteProp> = {
  5: "success",
  4: "primary",
  3: "neutral",
  2: "warning",
  1: "danger",
  0: "neutral",
};
