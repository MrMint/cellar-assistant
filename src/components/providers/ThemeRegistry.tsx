"use client";

import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider, extendTheme } from "@mui/joy/styles";
import EmotionCacheProvider from "./EmotionCacheProvider";

const theme = extendTheme({
  colorSchemes: {
    dark: {
      palette: {
        neutral: {
          "100": "#ECEAEF",
          "200": "#C5C1D0",
          "300": "#9E97B1",
          "400": "#786E91",
          "500": "#675E7D",
          "600": "#564E68",
          "700": "#443F53",
          "800": "#332F3E",
          "900": "#221F2A",
        },
        background: {
          body: "#111015",
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
