/**
 * Page sizes for the cellar connections, shared by the server components that
 * fetch the first page and the client components that fetch the rest.
 *
 * A plain module, with no `"use client"`, on purpose. These used to be exported
 * from the rewrite's `CellarsList.tsx` (since replaced by the restored
 * `cellar/Cellars.tsx`); a server component reading
 * a value out of a `"use client"` module gets a client reference, not the
 * number, and `JSON.stringify` drops it from the GraphQL variables — so the API
 * answered `Variable "$first" of required type "Int!" was not provided` and
 * `/cellars` 500'd. The first page and the next page have to agree, so the
 * number belongs somewhere both sides can read it.
 */

/** `myCellars`, one screenful of cards. */
export const CELLARS_PAGE_SIZE = 24;

/**
 * The cellar overview's "Open and recent" preview: a fixed handful, never
 * paged. (The items page's own size is `ITEMS_PAGE_SIZE` in
 * `components/cellar/cellarItemsQuery.ts`, the old 50.)
 */
export const OVERVIEW_ITEMS_PAGE_SIZE = 8;

/**
 * The preview's order: open bottles first, which is what "open and recent"
 * means. Fixed, and re-read only by a server render, so there is no client
 * ordering for it to disagree with.
 */
export const OVERVIEW_SORT = "OPEN_FIRST" as const;
