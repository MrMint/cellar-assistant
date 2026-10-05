/**
 * Map, place and menu-scan edges — UI parity wave C (G16, G18, G19, G20).
 *
 * The old map drawer, tier-list board, scan page and `/discoveries` read each
 * of these straight off a Hasura row: `places.user_place_interactions`,
 * `place_menu_items.{wine,beer,…}`, `place_menu_items(where menu_scan_id)`,
 * `item_match_suggestions.place_menu_item { place }`. Here each is a field on
 * the object, answered by the actor that owns (or may read) the rows.
 *
 * ## Cost
 *
 * The two edges drawn once per row of a list are `t.loadable`s, so a page
 * costs one actor call, not one per row (§1.5) — `place-edges.test.ts` counts
 * them:
 *
 * - `Place.myInteraction` (G16): one `UserActor.placeInteractionsFor` for
 *   every place in the tick, answered from rows that actor already holds.
 * - `MatchSuggestion.placeMenuItem` (G20): one
 *   `MatchSuggestionsCollectionActor.menuItemsOf` per page of suggestions.
 *
 * The rest are free or reuse a loader that already batches:
 * `MenuItemMatch.item` (G18) is an `Item` id handed to the `Item` loader;
 * `MatchSuggestion.place` and `PlaceInteraction.place` are `{ id }` stubs that
 * `place.ts`'s per-request memo resolves once per distinct place, and only if
 * a field beyond `id` is selected. `MenuScan.menuItems` (G19) is one call per
 * scan, as `MenuScan.suggestions` is — it is a scan page's own list.
 *
 * ## Whose rules
 *
 * Nothing here decides visibility. Your place interactions are yours alone
 * (`UserActor`'s self check); a scan's lines are its owner's
 * (`MenuScanActor.requireVisible`); a suggestion's menu line is reached only
 * through the viewer's own scans (the `menu_scans.user_id` join in
 * `menuItemsOf`). An anonymous viewer — who cannot read a place, an item or a
 * scan at all — gets `null` **without** a call where the actor would only
 * refuse.
 *
 * Its own module, imported after every module whose types it extends, for the
 * reason `reverse-edges.ts` gives: `place.ts` cannot import `item.ts`'s
 * interface and `menu-scan.ts` at once without an import cycle through
 * `tier-list.ts`, and `builder.objectField(s)` needs every ref to exist first.
 */
import type {
  ItemType,
  MenuItemMatch,
  PlaceInteractionDto,
  PlaceMenuItemDto,
} from "@cellar-assistant/contracts";
import {
  isItemType,
  itemActorId,
  MatchSuggestionsCollectionActorDescriptor,
  MenuScanActorDescriptor,
  REVERSE_EDGE_MAX_PARENTS,
  UserActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemInterface } from "./item.ts";
import { MatchSuggestionType, MenuScanType } from "./menu-scan.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import {
  MenuItemMatchType,
  PlaceMenuItemConnection,
  PlaceMenuItemType,
} from "./place.ts";
import { PlaceStubType } from "./tier-list.ts";
import { PlaceInteractionType } from "./user.ts";

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/** `keys`, deduplicated, in chunks a batched actor call accepts. */
const chunksOf = (keys: readonly string[]): string[][] => {
  const distinct = [...new Set(keys)];
  const chunks: string[][] = [];
  for (
    let start = 0;
    start < distinct.length;
    start += REVERSE_EDGE_MAX_PARENTS
  ) {
    chunks.push(distinct.slice(start, start + REVERSE_EDGE_MAX_PARENTS));
  }
  return chunks;
};

/* -------------------------------------------------------------------------- */
/* G16 — the viewer's own interaction with a place                             */
/* -------------------------------------------------------------------------- */

builder.objectField(PlaceStubType, "myInteraction", (t) =>
  t.loadable({
    type: PlaceInteractionType,
    nullable: true,
    description:
      "Your own row for this place — saved, visited, your rating — or null " +
      "if you never touched it, and for an anonymous viewer. What the " +
      "tier-list board shows as your score and the map drawer as your " +
      "saved/visited state. One batched `UserActor` call per request, " +
      "however many places.",
    resolve: (place) => place.id,
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(PlaceInteractionDto | null | Error)[]> => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return keys.map(() => null);
      const found = new Map<string, PlaceInteractionDto | Error>();
      for (const chunk of chunksOf(keys)) {
        try {
          const rows = await context
            .actor(UserActorDescriptor, viewerId)
            .placeInteractionsFor(chunk);
          for (const row of rows) found.set(row.placeId, row);
        } catch (cause) {
          for (const placeId of chunk) found.set(placeId, asError(cause));
        }
      }
      return keys.map((key) => found.get(key) ?? null);
    },
  }),
);

builder.objectField(PlaceInteractionType, "place", (t) =>
  t.field({
    type: PlaceStubType,
    description:
      "The place this row is about, so a saved-places list needs no second " +
      "query per row. Its fields are read through `PlaceActor`, once per " +
      "distinct place per request.",
    resolve: (row) => ({ id: row.placeId }),
  }),
);

/* -------------------------------------------------------------------------- */
/* G18 — the catalog item a menu line was matched to                           */
/* -------------------------------------------------------------------------- */

/** `wine` → `WINE`, or `null` for a spelling no item type has. */
const itemTypeOf = (match: MenuItemMatch): ItemType | null => {
  const upper = match.type.toUpperCase();
  return isItemType(upper) ? upper : null;
};

builder.objectField(MenuItemMatchType, "item", (t) =>
  t.field({
    type: ItemInterface,
    nullable: true,
    description:
      "The matched item itself — its name for the place menu and the scan " +
      "results — through the `Item` loader, so a page of lines is one " +
      "batch. Null for an anonymous viewer, and if the item has gone.",
    resolve: (match, _args, context) => {
      if (context.ctx.viewerId === null) return null;
      const type = itemTypeOf(match);
      return type === null ? null : itemActorId({ type, id: match.id });
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* G19 — every line a scan extracted                                           */
/* -------------------------------------------------------------------------- */

builder.objectField(MenuScanType, "menuItems", (t) =>
  t.field({
    type: PlaceMenuItemConnection,
    description:
      "Every line this scan extracted, matched or not — `suggestions` " +
      "reaches only the lines that got a suggestion. By menu category " +
      "(uncategorised last), then name, so the scan page can group them. " +
      "Yours alone, as the scan is. Paged; `totalCount` exact.",
    args: t.arg.connectionArgs(),
    resolve: async (scan, args, context) =>
      connectionFromPage(
        await context
          .actor(MenuScanActorDescriptor, scan.id)
          .menuItems(toPageArgs(args)),
      ),
  }),
);

/* -------------------------------------------------------------------------- */
/* G20 — a suggestion's place and menu line                                    */
/* -------------------------------------------------------------------------- */

builder.objectFields(MatchSuggestionType, (t) => ({
  place: t.field({
    type: PlaceStubType,
    description:
      "The place whose menu the suggestion's line is on — `/discoveries`' " +
      "place context. Free until you select a field beyond `id`; then one " +
      "`PlaceActor` read per distinct place.",
    resolve: (suggestion) => ({ id: suggestion.placeId }),
  }),
  placeMenuItem: t.loadable({
    type: PlaceMenuItemType,
    nullable: true,
    description:
      "The menu line this suggestion is about (price, category, " +
      "description). Reached only through your own scans. One batched call " +
      "per page of suggestions. Null for an anonymous viewer.",
    resolve: (suggestion) => suggestion.placeMenuItemId,
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(PlaceMenuItemDto | null | Error)[]> => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return keys.map(() => null);
      const found = new Map<string, PlaceMenuItemDto | null | Error>();
      for (const chunk of chunksOf(keys)) {
        try {
          const lines = await context
            .actor(
              MatchSuggestionsCollectionActorDescriptor,
              viewerCollectionActorId(viewerId),
            )
            .menuItemsOf(chunk);
          for (const [index, id] of chunk.entries()) {
            found.set(id, lines[index] ?? null);
          }
        } catch (cause) {
          for (const id of chunk) found.set(id, asError(cause));
        }
      }
      return keys.map((key) => found.get(key) ?? null);
    },
  }),
}));
