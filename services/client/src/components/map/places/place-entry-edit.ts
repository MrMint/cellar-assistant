/**
 * F-201: "Change the band" and "Remove from list" on the place's More sheet.
 * Both write to the viewer's own list entry only: `own` is
 * `ownListEntries`' output (CC-3), so an entry on a friend's or a public list
 * plans no write at all, whatever id the caller passes.
 */

import { bandMapOf, moveEntry } from "@/components/tier-list/adapter";
import type { PlaceListEntry } from "./PlaceSections";

/** The list's rows, as `ListRanksQuery` reads them. */
export type ListRow = { readonly id: string; readonly band: number };

const ownEntry = (
  own: readonly PlaceListEntry[],
  entryId: string,
): (PlaceListEntry & { tier_list: { id: string } }) | null => {
  const entry = own.find((candidate) => candidate.id === entryId);
  return entry?.tier_list ? { ...entry, tier_list: entry.tier_list } : null;
};

/**
 * The one `reorderTierListBand` call that moves the entry to the end of
 * `band` (as Arrange's "Move to band" does), with its rank after. Null when
 * the entry is not the viewer's, or is already in that band.
 */
export function planBandChange(
  own: readonly PlaceListEntry[],
  entryId: string,
  rows: readonly ListRow[],
  band: number,
): {
  tierListId: string;
  call: { band: number; orderedIds: string[] };
  band: number;
  rank: number;
} | null {
  const entry = ownEntry(own, entryId);
  if (entry === null) return null;
  const moved = moveEntry(bandMapOf(rows), entryId, { kind: "band", band });
  if (moved === null) return null;
  return {
    tierListId: entry.tier_list.id,
    call: moved.call,
    band: moved.band,
    rank: moved.rank,
  };
}

/** `removeTierListItem`'s arguments, or null when the entry isn't the viewer's. */
export function planRemove(
  own: readonly PlaceListEntry[],
  entryId: string,
): { tierListId: string; id: string } | null {
  const entry = ownEntry(own, entryId);
  return entry === null
    ? null
    : { tierListId: entry.tier_list.id, id: entry.id };
}
