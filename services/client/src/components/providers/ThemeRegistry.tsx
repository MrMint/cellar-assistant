"use client";

import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider, extendTheme } from "@mui/joy/styles";
import { color, joyRamps } from "@/lib/tokens";
import EmotionCacheProvider from "./EmotionCacheProvider";

/**
 * Joy reads the same tokens as Tailwind (D20 transition; deleted with Joy in
 * the removal step), so a page still on Joy and a converted one look like one
 * app: warm surfaces and inks, and the **brass flip** (D21) — `primary` is the
 * brass ramp with `#1A1408` ink on solid fills, never white on brass. Teal is
 * gone from every action; it returns only as `--ca-ai` through AIDraftField.
 *
 * Values are hex from `lib/tokens.ts`, not `var(--ca-*)`: Joy derives its
 * `*Channel` variables from hex and breaks on `var()`.
 */
export const theme = extendTheme({
  components: {
    JoySlider: {
      styleOverrides: {
        // A disabled slider's filled track is `solidDisabledBg` (neutral 800)
        // and its rail is `background.level2` — both `surface3` here, so the
        // level vanished (a friend's "Remaining: 60%" showed an empty bar).
        // Lift the track off the rail. (Joy sets the disabled colours under
        // `&.Mui-disabled`, so the override has to match that selector.)
        root: {
          "&.Mui-disabled": {
            "--Slider-trackBackground": joyRamps.neutral[600],
          },
        },
      },
    },
  },
  fontFamily: {
    body: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    display: "var(--font-fraunces), ui-serif, Georgia, serif",
  },
  colorSchemes: {
    dark: {
      palette: {
        primary: {
          ...joyRamps.brass,
          solidColor: color.onAccent,
          solidBg: color.accent,
          solidHoverBg: joyRamps.brass[400],
          solidActiveBg: joyRamps.brass[600],
        },
        neutral: {
          ...joyRamps.neutral,
          // Joy's default solid neutral (tooltips, solid chips) is white on
          // 500; 500 is a text colour here, so solids sit on 600 (7.41:1).
          solidBg: joyRamps.neutral[600],
          solidHoverBg: joyRamps.neutral[700],
          solidActiveBg: joyRamps.neutral[800],
        },
        danger: {
          ...joyRamps.danger,
          solidColor: color.bg,
          solidBg: color.danger,
          solidHoverBg: joyRamps.danger[300],
          solidActiveBg: joyRamps.danger[500],
        },
        success: {
          ...joyRamps.success,
          solidColor: color.bg,
          solidBg: color.success,
          solidHoverBg: joyRamps.success[300],
          solidActiveBg: joyRamps.success[500],
        },
        background: {
          body: color.bg,
          surface: color.surface1,
          popup: color.surface2,
          level1: color.surface2,
          level2: color.surface3,
          level3: joyRamps.surface4,
          tooltip: color.surface3,
        },
        text: {
          primary: color.ink1,
          secondary: color.ink2,
          tertiary: color.ink3,
          icon: color.ink3,
        },
        divider: color.line,
        focusVisible: color.accent,
      },
    },
  },
});

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EmotionCacheProvider options={{ key: "joy" }}>
      <CssVarsProvider defaultColorScheme={"dark"} theme={theme}>
        <CssBaseline />
        {children}
      </CssVarsProvider>
    </EmotionCacheProvider>
  );
}
