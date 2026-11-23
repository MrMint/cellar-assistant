/**
 * W-14: a drink log changed — written, edited, deleted, restored or undone.
 *
 * Seen at (`components/item/SeenAtSection.tsx`) is a urql slot over
 * `Item.seenAt`, cached by graphcache, and nothing in a log mutation's answer
 * touches that field: a log with a place did not show there until a reload.
 * The writers announce here and the reader re-asks, network-only, so neither
 * imports the other and every place that logs (the item page, Home's shelf,
 * a menu line, a cellar check-in) is covered by the sheet they all share.
 *
 * `itemId` is the item the log is for, or null when the writer does not know
 * it (an undo from a toast): a listener then refreshes whatever it shows.
 */
const DRINK_LOG_CHANGED = "drink-log-changed";

type Detail = { readonly itemId: string | null };

/** One bus per page: writer and reader share this module in the client bundle. */
const bus = new EventTarget();

export const announceDrinkLogChanged = (itemId: string | null): void => {
  bus.dispatchEvent(
    new CustomEvent<Detail>(DRINK_LOG_CHANGED, { detail: { itemId } }),
  );
};

/** Calls `listener` after every log change for `itemId` (or an unknown one). */
export const onDrinkLogChanged = (
  itemId: string,
  listener: () => void,
): (() => void) => {
  const handle = (event: Event) => {
    const changed = (event as CustomEvent<Detail>).detail?.itemId ?? null;
    if (changed === null || changed === itemId) listener();
  };
  bus.addEventListener(DRINK_LOG_CHANGED, handle);
  return () => bus.removeEventListener(DRINK_LOG_CHANGED, handle);
};
