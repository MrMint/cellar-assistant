/**
 * The brand an item shows, and how to pick it from its brand links — kept
 * apart from `brand-change.ts` because `ItemEditPage` (a server component)
 * needs it, and `brand-change.ts` imports urql, whose module scope calls
 * `createContext`: pulled into the server bundle it breaks `next build`'s
 * page-data collection for every `/…/edit` route.
 */

/** The brand an item shows — its primary link, or its first. */
export type ShownBrand = { brandId: string; name: string };

/** The primary link's brand, or the first one's — what the item page shows. */
export const shownBrandOf = (
  links: readonly {
    isPrimary?: boolean | null;
    brand?: { id: string; name: string } | null;
  }[],
): ShownBrand | null => {
  const link = links.find((candidate) => candidate.isPrimary) ?? links[0];
  return link?.brand === null || link?.brand === undefined
    ? null
    : { brandId: link.brand.id, name: link.brand.name };
};
