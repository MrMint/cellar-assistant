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
 * A Discover section's page (X11): strangers' public cellars and tier lists
 * are a taste of what is out there, not a catalog, so a short first page and
 * "Show more" for the rest.
 */
export const DISCOVER_PAGE_SIZE = 6;

/**
 * How many cards one page of a `/cellars` or `/tier-lists` section holds
 * (X11): a short Discover, a screenful otherwise. Here, not beside the client
 * components, because the server pages read it too (client-boundary.test.ts).
 */
export const sectionPageSize = (
  section: "MINE" | "FRIENDS" | "DISCOVER",
  screenful: number = CELLARS_PAGE_SIZE,
): number => (section === "DISCOVER" ? DISCOVER_PAGE_SIZE : screenful);
