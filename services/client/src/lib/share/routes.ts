/**
 * X17: which URLs can be opened by someone with no session, and where the
 * public version of each one lives.
 *
 * ## One URL per thing
 *
 * A shared link is the **same URL the app uses** — `/tier-lists/<id>`,
 * `/recipes/<id>`, `/wines/<id>` — not a separate "share" address. So the
 * address bar is always shareable, a link a signed-in friend opens lands on
 * the real page, and a signed-out one sees the public page *at that URL*:
 * `src/proxy.ts` rewrites (never redirects) a signed-out request for one of
 * these paths to its `/share/…` page, so the browser keeps the canonical URL
 * and sign-in can come straight back to it.
 *
 * `/share/…` itself is public too, so the link-preview card
 * (`opengraph-image`) beneath it can be fetched by a crawler; a signed-in
 * viewer who lands there is sent to the canonical page.
 *
 * `/invite/<token>` is the friend invite: public, and the same page signed in
 * or out.
 *
 * Pure: imported by the proxy, the pages and the share actions, and tested
 * without a Next runtime (`routes.test.ts`).
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/** The route segment per item type: `WINE` → `wines` (as `itemPageHref`). */
export const ITEM_SEGMENTS: Readonly<Record<ApiItemType, string>> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** What a canonical shareable path names. */
export type ShareTarget =
  | { readonly kind: "tier-list"; readonly id: string }
  | { readonly kind: "recipe"; readonly id: string }
  | { readonly kind: "item"; readonly type: ApiItemType; readonly id: string };

const ITEM_BY_SEGMENT = new Map(
  (Object.entries(ITEM_SEGMENTS) as [ApiItemType, string][]).map(
    ([type, segment]) => [segment, type],
  ),
);

const TIER_LIST = new RegExp(`^/tier-lists/(${UUID})/?$`);
const RECIPE = new RegExp(`^/recipes/(${UUID})/?$`);
const ITEM = new RegExp(`^/([a-z]+)/(${UUID})/?$`);

/** The thing a canonical path shares, or `null` for any other path. */
export const shareTargetOf = (pathname: string): ShareTarget | null => {
  const tierList = TIER_LIST.exec(pathname);
  if (tierList?.[1]) return { kind: "tier-list", id: tierList[1] };
  const recipe = RECIPE.exec(pathname);
  if (recipe?.[1]) return { kind: "recipe", id: recipe[1] };
  const item = ITEM.exec(pathname);
  const type = item?.[1] ? ITEM_BY_SEGMENT.get(item[1]) : undefined;
  if (type !== undefined && item?.[2])
    return { kind: "item", type, id: item[2] };
  return null;
};

/** The canonical, in-app path of a share target. */
export const canonicalPath = (target: ShareTarget): string => {
  switch (target.kind) {
    case "tier-list":
      return `/tier-lists/${target.id}`;
    case "recipe":
      return `/recipes/${target.id}`;
    case "item":
      return `/${ITEM_SEGMENTS[target.type]}/${target.id}`;
  }
};

/** Where the public page for a share target is served. */
export const publicPath = (target: ShareTarget): string => {
  switch (target.kind) {
    case "tier-list":
      return `/share/tier-lists/${target.id}`;
    case "recipe":
      return `/share/recipes/${target.id}`;
    case "item":
      return `/share/items/${ITEM_SEGMENTS[target.type]}/${target.id}`;
  }
};

/**
 * The proxy's question: where a **signed-out** request for `pathname` should
 * be served from, or `null` to leave it alone (and gate it as usual).
 */
export const publicRewriteFor = (pathname: string): string | null => {
  const target = shareTargetOf(pathname);
  return target === null ? null : publicPath(target);
};

/** Paths that are public in their own right: the share pages and invites. */
export const isPublicSharePath = (pathname: string): boolean =>
  pathname.startsWith("/share/") || pathname.startsWith("/invite/");

/** The item type a `/share/items/<segment>/…` segment names, if any. */
export const itemTypeOfSegment = (segment: string): ApiItemType | null =>
  ITEM_BY_SEGMENT.get(segment) ?? null;

/** `/invite/<token>`. */
export const invitePath = (token: string): string =>
  `/invite/${encodeURIComponent(token)}`;

/** An absolute URL for sharing: the origin, then the path. */
export const absoluteUrl = (origin: string, path: string): string =>
  `${origin.replace(/\/+$/, "")}${path}`;
