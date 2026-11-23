/**
 * The item page's Add to Cellar sheet (N21), as data: its limits and its
 * words. Plain module — `add-to-cellar.test.ts`.
 */

/** A case is twelve; more than that at once is a typo, not a haul. */
export const MAX_BOTTLES_AT_ONCE = 12;

/** The Undo toast's line: "Added to Home Cellar", "Added 3 bottles to …". */
export const addedMessage = (count: number, cellarName: string): string =>
  count === 1
    ? `Added to ${cellarName}`
    : `Added ${count} bottles to ${cellarName}`;

/**
 * L02 — the re-buy offer: adding another bottle of something you have had
 * (any bottle of it, finished or not, besides the ones just added) asks for a
 * photo of its label or receipt, which keeps this bottle's price and date.
 * `null` for a first bottle: there is nothing to tell apart yet.
 */
export const rebuyOffer = ({
  bottlesOfItem,
  added,
  name,
}: {
  /** Every bottle of this item in your cellars, after the add (status ALL). */
  bottlesOfItem: number;
  added: number;
  name: string;
}): { readonly title: string; readonly body: string } | null =>
  bottlesOfItem - added <= 0
    ? null
    : {
        title: `Another ${name} added`,
        body: "Snap its label or receipt to keep this bottle's price and date.",
      };
