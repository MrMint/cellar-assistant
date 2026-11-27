import { BarEntryRow } from "@/components/recipe/BarEntryRow";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import type { MakeabilityLike } from "./copy";
import { BAR_SECTION_LIMIT, YourBarQuery } from "./queries";
import { readinessLine, splitBar } from "./your-bar/sections";

const FALLBACK_SUMMARY = "From your cellars and Bar pantry";

type Rows<Row> = { readonly edges: readonly { readonly node: Row }[] };

/** "1 ready · 5 one away", as Your bar counts it. */
const barSummary = <Row extends { makeability: MakeabilityLike }>(data: {
  makeNow: Rows<Row>;
  oneBottleAway: Rows<Row>;
  makeNowCount: number;
  oneBottleAwayCount: number;
}): string => {
  const bar = splitBar({
    makeNow: data.makeNow.edges.map((edge) => edge.node),
    oneBottleAway: data.oneBottleAway.edges.map((edge) => edge.node),
    makeNowCount: data.makeNowCount,
    oneBottleAwayCount: data.oneBottleAwayCount,
  });
  return readinessLine(bar.readyCount, bar.awayCount);
};

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
    // The read Your bar makes, split the way Your bar splits it (R3's
    // `splitBar`: a swap is never Make now), so the two counts agree.
    const data = await apiServerQuery(YourBarQuery, {
      limit: BAR_SECTION_LIMIT,
    });
    const result = unwrapResult(data.whatCanIMake, "WhatCanIMake");
    if (result.ok) {
      summary =
        result.data.bottleCount === 0 && result.data.pantryCount === 0
          ? "Stock your Bar pantry to find out"
          : barSummary(result.data);
    }
  } catch {
    // The plain link is still the right card; the bar page says what failed.
  }
  return <BarEntryRow summary={summary} />;
}
