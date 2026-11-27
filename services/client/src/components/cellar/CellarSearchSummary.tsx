/**
 * The line above a cellar search's results (X04): how many bottles the
 * search kept — bottles, not cards (D13: a ×3 card is three) — and, when the
 * phrase could not be embedded, that the list is name matches only. A short
 * list must not pass for a complete one.
 */
export type CellarSearchMeaning = "NOT_ASKED" | "USED" | "UNAVAILABLE";

export const cellarSearchSummaryText = ({
  search,
  bottleCount,
  meaning,
}: {
  search: string;
  bottleCount: number;
  meaning: CellarSearchMeaning;
}): { count: string | null; note: string | null } => ({
  count:
    bottleCount === 0
      ? null
      : `${bottleCount} ${bottleCount === 1 ? "bottle matches" : "bottles match"} “${search}”`,
  note:
    meaning === "UNAVAILABLE"
      ? "Matching names only: searching by taste isn't available right now."
      : null,
});

export function CellarSearchSummary(props: {
  search: string;
  bottleCount: number;
  meaning: CellarSearchMeaning;
}) {
  const { count, note } = cellarSearchSummaryText(props);
  if (count === null && note === null) return null;
  return (
    <div data-slot="cellar-search-summary" className="flex flex-col gap-0.5">
      {count !== null && (
        <p role="status" className="t-body text-ink-2">
          {count}
        </p>
      )}
      {note !== null && <p className="t-cap">{note}</p>}
    </div>
  );
}
