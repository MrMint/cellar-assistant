"use client";

import { Box } from "@mui/joy";
import ThemeRegistry from "@/components/providers/ThemeRegistry";
import { BoundaryError } from "@/components/shell/BoundaryError";

/**
 * The last resort: an error in the root layout, which replaces the whole
 * document. Nothing from the layout survives — not the theme, not the font —
 * so it mounts the Joy theme itself, or it would render as the browser's
 * default black-on-white inside an app that is dark everywhere else.
 */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Cellar Assistant</title>
        <ThemeRegistry>
          <Box sx={{ display: "flex", minHeight: "100dvh" }}>
            <BoundaryError {...props} />
          </Box>
        </ThemeRegistry>
      </body>
    </html>
  );
}
