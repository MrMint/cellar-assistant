"use client";

import { MainContent } from "@/components/app/main-content";
import { BoundaryError } from "@/components/shell/BoundaryError";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * The last resort: an error in the root layout, which replaces the whole
 * document. Nothing from the layout survives — not the stylesheet, not the
 * `data-theme`, not the fonts — so it brings the first two itself: the
 * stylesheet, and the theme from the same pre-paint script the layout runs
 * (it reads the `theme` cookie; dark until it has). (The fonts fall back to
 * the system stack.)
 */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built from our own tokens, no input.
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="bg-background font-sans text-foreground">
        <title>Something went wrong · Cellar Assistant</title>
        {/* The root layout (and its skip link) is gone; the main stays (X21). */}
        <MainContent className="flex min-h-dvh">
          <BoundaryError {...props} />
        </MainContent>
      </body>
    </html>
  );
}
