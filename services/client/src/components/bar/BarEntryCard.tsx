import { ChevronRight, Cocktail } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { WhatCanIMakeQuery } from "./queries";

const FALLBACK_SUMMARY = "From your cellars and Bar pantry";

/** The card itself — the link and the one line under it. */
function BarEntryRow({ summary }: { summary: string }) {
  return (
    <div
      data-testid="bar-entry"
      className="relative flex min-h-16 items-center gap-4 rounded-lg bg-surface-1 px-4 py-3 active:bg-surface-3"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-1">
        <Cocktail aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href="/recipes/bar"
          overlay
          underline="none"
          className="type-headline text-ink-1"
        >
          What can I make?
        </Link>
        <span className="truncate type-footnote">{summary}</span>
      </div>
      <ChevronRight aria-hidden className="size-5 text-ink-3" />
    </div>
  );
}

/**
 * What `/recipes` shows while the bar is judged (the `<Suspense>` fallback):
 * the same card, already a working link, with the generic line. Judging scans
 * the newest cocktails against the viewer's bar, and the recipe list above
 * the fold must not wait on it.
 */
export function BarEntryCardFallback() {
  return <BarEntryRow summary={FALLBACK_SUMMARY} />;
}

/**
 * The way into What can I make from `/recipes` (G29): one row that already
 * answers the question — "4 ready to make · 7 one bottle away" — so the
 * tap is a decision rather than a gamble. A server component, rendered inside
 * a `<Suspense>`; any failure — a refusal *or* a thrown transport error —
 * degrades to the plain link rather than taking the page down.
 */
export async function BarEntryCard() {
  let summary = FALLBACK_SUMMARY;
  try {
    const data = await apiServerQuery(WhatCanIMakeQuery, { limit: 1 });
    const result = unwrapResult(data.whatCanIMake, "WhatCanIMake");
    if (result.ok) {
      summary =
        result.data.bottleCount === 0 && result.data.pantryCount === 0
          ? "Stock your Bar pantry to find out"
          : `${result.data.makeNowCount} ready to make · ${result.data.oneBottleAwayCount} one bottle away`;
    }
  } catch {
    // The plain link is still the right card; the bar page says what failed.
  }
  return <BarEntryRow summary={summary} />;
}
