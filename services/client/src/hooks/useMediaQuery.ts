"use client";

import { useEffect, useState } from "react";

/**
 * Custom media query hook for Joy UI themes
 * Provides responsive breakpoint detection without @mui/system dependency
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    // Server-side rendering guard
    if (typeof window === "undefined") {
      return;
    }

    const mediaQueryList = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQueryList.matches);

    // Update on media query change
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Use the modern addEventListener if available
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", handleChange);

      return () => {
        mediaQueryList.removeEventListener("change", handleChange);
      };
    } else {
      // Fallback for older browsers
      mediaQueryList.addListener(handleChange);

      return () => {
        mediaQueryList.removeListener(handleChange);
      };
    }
  }, [query]);

  return matches;
}

/**
 * Helper function to convert Joy UI theme breakpoints to media queries
 * Usage: useMediaQuery(breakpointDown("md"))
 */
export function breakpointDown(
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl",
): string {
  const breakpoints = {
    xs: "600px",
    sm: "900px",
    md: "1200px",
    lg: "1536px",
    xl: "1920px",
  };

  return `(max-width: ${breakpoints[breakpoint]})`;
}

/**
 * Helper function for min-width media queries
 * Usage: useMediaQuery(breakpointUp("md"))
 */
export function breakpointUp(
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl",
): string {
  const breakpoints = {
    xs: "0px",
    sm: "600px",
    md: "900px",
    lg: "1200px",
    xl: "1536px",
  };

  return `(min-width: ${breakpoints[breakpoint]})`;
}
