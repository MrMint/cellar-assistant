import type { ColorPaletteProp } from "@mui/joy";

export {
  BAND_COLORS,
  BAND_LABELS,
  BANDS,
  type Band,
} from "@cellar-assistant/shared/constants/bands";

export const BAND_JOY_COLORS: Record<number, ColorPaletteProp> = {
  5: "success",
  4: "primary",
  3: "neutral",
  2: "warning",
  1: "danger",
  0: "neutral",
};
