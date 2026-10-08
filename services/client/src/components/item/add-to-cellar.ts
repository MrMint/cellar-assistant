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
