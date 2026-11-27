import { BarEntryRow } from "@/components/recipe/BarEntryRow";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { WhatCanIMakeQuery } from "./queries";

const FALLBACK_SUMMARY = "From your cellars and Bar pantry";

/** "1 ready · 5 one away" (Recipes-Browse 01). */
export const barCounts = (ready: number, oneAway: number): string =>
  `${ready} ready · ${oneAway} one away`;

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
 * answers the question — "4 ready · 7 one away" — so the
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
          : barCounts(result.data.makeNowCount, result.data.oneBottleAwayCount);
    }
  } catch {
    // The plain link is still the right card; the bar page says what failed.
  }
  return <BarEntryRow summary={summary} />;
}
