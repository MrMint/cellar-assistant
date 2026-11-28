"use client";

import type { ReactNode } from "react";
import { Barcode, Camera, ICON_STROKE, Search } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { greetingText } from "@/components/search/Greeting";
import { useHasMounted } from "@/components/search/useHasMounted";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/**
 * Home's top (Landing, Shell-Home): the greeting as the page's one heading
 * with the count line beside it on a phone and under it from `md`, then the
 * search field. On a phone the field carries Scan and Photo; from `md` it
 * moves to the top right with its "/" key, as Shell-Home-desktop draws it.
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
  /** "240 bottles" — streamed in by the page; nothing for a new person. */
  collectionLine?: ReactNode;
}) {
  const mounted = useHasMounted();
  return (
    <header className="flex flex-col gap-3 pt-2 md:flex-row md:items-start md:justify-between md:gap-6 md:pt-4">
      <div className="flex min-w-0 items-end justify-between gap-3 md:flex-col md:items-start md:justify-start md:gap-0.5">
        <h1 className="t-title m-0 flex min-h-8 min-w-0 items-end text-ink">
          {mounted ? (
            <span className="animate-in fade-in-0 duration-(--ca-dur-medium) ease-enter">
              {greetingText(new Date(), displayName)}
            </span>
          ) : (
            <span className="sr-only">Today</span>
          )}
        </h1>
        <div className="flex min-h-6 shrink-0 items-center md:min-h-5">
          {collectionLine}
        </div>
      </div>
      <SearchPill className="md:w-80 md:shrink-0" />
    </header>
  );
}

/** The search field's words, drawn and loading alike. */
export const SEARCH_PLACEHOLDER = "Bottles, places, lists";

/**
 * The search field on Home: a link, not an input — tapping it opens the
 * search sheet, where the real input takes focus. Shaped like the input it
 * opens (44 tall, r8, edge), so the hand already knows where to go. On a
 * phone Scan and Photo sit at its end (each 44, its own label under its
 * glyph); from `md` they give way to the "/" key.
 */
export function SearchPill({ className }: { className?: string }) {
  return (
    <div
      data-slot="home-search"
      className={cn(
        "flex h-11 items-stretch overflow-hidden rounded-md border border-edge bg-card",
        className,
      )}
    >
      <Link
        href="/search"
        underline="none"
        aria-label="Search bottles, places and recipes"
        onClick={() => feedback("press")}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 text-ink-3 outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:-outline-offset-2 active:bg-raised [@media(hover:hover)]:hover:bg-raised"
      >
        <Search
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 shrink-0 text-glyph"
        />
        <span className="t-body min-w-0 flex-1 truncate">
          {SEARCH_PLACEHOLDER}
        </span>
        <kbd
          aria-hidden
          className="t-micro hidden size-6 shrink-0 items-center justify-center rounded-sm border border-edge-2 font-sans text-ink-2 md:flex"
        >
          /
        </kbd>
      </Link>
      <FieldAction href="/search?with=scan" label="Scan" icon={Barcode} />
      <FieldAction href="/search?with=photo" label="Photo" icon={Camera} />
    </div>
  );
}

function FieldAction({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Search;
}) {
  return (
    <Link
      href={href}
      underline="none"
      onClick={() => feedback("press")}
      className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-edge border-l text-ink outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:-outline-offset-2 active:bg-raised md:hidden [@media(hover:hover)]:hover:bg-raised"
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-4 text-act-ink"
      />
      <span className="t-micro">{label}</span>
    </Link>
  );
}
