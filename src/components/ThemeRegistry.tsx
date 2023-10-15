"use client";
import { CssVarsProvider, extendTheme } from "@mui/joy/styles";
import CssBaseline from "@mui/joy/CssBaseline";
import EmotionCacheProvider from "./EmotionCacheProvider";

const theme = extendTheme({
  colorSchemes: {
    dark: {
      palette: {
        neutral: {
          "100": "#e4e2e9",
          "200": "#c9c5d3",
          "300": "#aea8bd",
          "400": "#938ba7",
          "500": "#786e91",
          "600": "#605874",
          "700": "#484257",
          "800": "#302c3a",
          "900": "#18161d",
        },
        background: {
          body: "var(--joy-palette-neutral-900)",
          surface: "var(--joy-palette-neutral-800)",
          level1: "var(--joy-palette-neutral-700)",
          level2: "var(--joy-palette-neutral-600)",
          level3: "var(--joy-palette-neutral-500)",
          tooltip: "var(--joy-palette-neutral-500)",
        },
        primary: {
          "100": "#eff5f5",
          "200": "#cfe0e2",
          "300": "#afcccf",
          "400": "#8fb8bc",
          "500": "#70a3a9",
          "600": "#568a8f",
          "700": "#436b70",
          "800": "#304d50",
          "900": "#1d2e30",
        },
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
