import { heldBackNote } from "./adapter";

/**
 * The line under a list the API stops at 100 rows, when it held some back
 * (see "No silent caps" in `./fragments.ts`). Not in the old UI, which read
 * these lists unbounded; renders nothing whenever the list is whole.
 */
export function HeldBackNote({
  shown,
  total,
  noun,
  order,
}: {
  shown: number;
  total: number | null | undefined;
  noun: string;
  order?: "first" | "newest";
}) {
  const note = heldBackNote(shown, total, noun, order);
  if (note === null) return null;
  return <p className="t-cap text-ink-3">{note}</p>;
}
