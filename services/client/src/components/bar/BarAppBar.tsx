"use client";

import { AppBar } from "@/components/app/AppBar";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";

/**
 * Your bar's top bar (Recipes-Make board): Back, "Your bar" over its
 * readiness line ("1 ready · 5 one away"), and a quiet "Pantry" at the right
 * — a word, not a bare glyph (KIT § 4 Touch). A client module of its own
 * because `AppBar` is one, and the page is a server component.
 */
export function BarAppBar({ line }: { line?: string }) {
  return (
    <AppBar
      parent="/recipes"
      title={
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="t-title m-0 truncate text-ink">Your bar</h1>
            {line !== undefined && (
              <p
                data-testid="bar-readiness"
                className="t-cap m-0 text-ink-2 tabular-nums"
              >
                {line}
              </p>
            )}
          </div>
          <Button asChild variant="quiet">
            <Link href="/recipes/bar/pantry" underline="none">
              Pantry
            </Link>
          </Button>
        </div>
      }
    />
  );
}
