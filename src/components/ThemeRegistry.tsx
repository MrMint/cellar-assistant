"use client";
import { CssVarsProvider, extendTheme } from "@mui/joy/styles";
import CssBaseline from "@mui/joy/CssBaseline";
import EmotionCacheProvider from "./EmotionCacheProvider";

const theme = extendTheme({
  colorSchemes: {
    dark: {
      palette: {
        neutral: {},
        primary: {
          "100": "#EACDA4",
        },
        background: {
          body: "#443B4C",
          surface: "#322a38",
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
