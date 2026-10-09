"use client";

import type { ReactNode } from "react";
import { ICON_STROKE, Search } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { greetingText } from "@/components/search/Greeting";
import { useHasMounted } from "@/components/search/useHasMounted";
import { cn } from "@/lib/utils";

/**
 * Home's top (X10): the greeting as the page's one heading, the collection
 * line under it, and the search field — a link that opens the full-screen
 * search sheet (`/search`), drawn at thumb-friendly height.
 *
 * The greeting is the browser's (X01): the time of day is the viewer's, so
 * the server sends an empty line of the heading's height and the words fade
 * in after hydration. The `h1` itself is always there, named for screen
 * readers, so the page never lacks its heading.
 */
export function TodayHeader({
  displayName,
  collectionLine,
}: {
  displayName?: string;
  /** "53 bottles across 4 cellars" — streamed in by the page. */
  collectionLine?: ReactNode;
}) {
  const mounted = useHasMounted();
  return (
    <header className="flex flex-col gap-4 pt-2 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="type-large-title flex min-h-10 items-end text-ink-1">
          {mounted ? (
            <span className="animate-in fade-in-0 duration-(--ca-dur-medium) ease-enter">
              {greetingText(new Date(), displayName)}
            </span>
          ) : (
            <span className="sr-only">Today</span>
          )}
        </h1>
        <div className="flex min-h-6 items-center">{collectionLine}</div>
      </div>
      <SearchPill />
    </header>
  );
}

/**
 * The search field on Home: a link, not an input — tapping it opens the
 * search sheet, where the real input takes focus. Shaped like the input it
 * opens, so the hand already knows where to go.
 */
export function SearchPill({ className }: { className?: string }) {
  return (
    <Link
      href="/search"
      underline="none"
      aria-label="Search bottles, places and recipes"
      className={cn(
        "flex h-12 items-center gap-2 rounded-md bg-surface-2 px-3 text-ink-3 transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-3 active:bg-surface-3",
        className,
      )}
    >
      <Search aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
      <span className="type-body">Search bottles, places, recipes</span>
    </Link>
  );
}
