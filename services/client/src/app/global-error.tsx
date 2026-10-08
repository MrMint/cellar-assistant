"use client";

import { BoundaryError } from "@/components/shell/BoundaryError";
import "./globals.css";

/**
 * The last resort: an error in the root layout, which replaces the whole
 * document. Nothing from the layout survives — not the stylesheet, not the
 * dark `data-theme`, not the fonts — so it brings the first two itself, or it
 * would render as the browser's default black-on-white inside an app that is
 * dark everywhere else. (The fonts fall back to the system stack.)
 */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className="bg-background font-sans text-foreground">
        <title>Something went wrong · Cellar Assistant</title>
        <div className="flex min-h-dvh">
          <BoundaryError {...props} />
        </div>
      </body>
    </html>
  );
}
