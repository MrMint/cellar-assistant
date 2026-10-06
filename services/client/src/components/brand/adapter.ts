/**
 * Brand adapters: new API shapes → the old `BrandCard` and `BrandDetails`
 * props (`82450ad1:src/components/brand/*`).
 *
 * The input types are structural, so tests (and any other document that
 * selected the same fields) can feed them without a query. The old props are
 * kept exactly — snake_case and all — so the restored components are the old
 * code; this file is where the API's camelCase meets them.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { formatVintage } from "@/utilities";
import type { BrandCardItem } from "./BrandCard";
import type { BrandDetailsItem, BrandItem, BrandPlace } from "./BrandDetails";
import { BrandItemLinkFragment } from "./queries";

type Connection<T> = { readonly edges: readonly { readonly node: T }[] };

export type BrandCoreSource = {
  id: string;
  name: string;
  brandType?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  parentBrandId?: string | null;
  createdAt?: string | null;
  itemCount?: number | null;
};

/**
 * One brand → `BrandCardItem`, as the old `toBrandCardItems` built it.
 * `item_count` is `Brand.itemCount` (G23); `place_count` stays omitted, as it
 * was; `parent_brand` stays unset, as it was — the old list query never
 * selected it, so "Part of …" never rendered on the index.
 */
export const brandCardFromSource = (brand: BrandCoreSource): BrandCardItem => ({
  id: brand.id,
  name: brand.name,
  description: brand.description ?? null,
  logo_url: brand.logoUrl ?? null,
  brand_type: brand.brandType ?? "other",
  parent_brand_id: brand.parentBrandId ?? null,
  item_count: brand.itemCount ?? undefined,
});

export const toBrandCardItems = (
  brands: readonly BrandCoreSource[],
): BrandCardItem[] => brands.map(brandCardFromSource);

/** The old per-table relation each item type sat behind on `item_brands`. */
const RELATION: Record<
  ApiItemType,
  "wine" | "beer" | "spirit" | "coffee" | "sake" | "tea"
> = {
  WINE: "wine",
  BEER: "beer",
  SPIRIT: "spirit",
  COFFEE: "coffee",
  SAKE: "sake",
  TEA: "tea",
};

export type BrandItemLinkSource = {
  id: string;
  isPrimary: boolean;
  item: {
    id: string;
    type: ApiItemType;
    name: string;
    vintage?: string | null;
  };
};

/**
 * One `ItemBrand` link → the old `item_brands` row: the item under its type's
 * relation and every other relation absent. A wine's vintage is the year —
 * the old page printed the raw `date` ("2015-01-01 Name").
 */
export const brandItemFromLink = (link: BrandItemLinkSource): BrandItem => {
  const relation = RELATION[link.item.type];
  const base = { id: link.item.id, name: link.item.name };
  return {
    id: link.id,
    is_primary: link.isPrimary,
    [relation]:
      relation === "wine"
        ? { ...base, vintage: formatVintage(link.item.vintage) ?? null }
        : base,
  } satisfies BrandItem;
};

/** A `...BrandItemLink` node → {@link BrandItemLinkSource}. */
export const itemLinkFromFragment = (
  node: FragmentOf<typeof BrandItemLinkFragment>,
): BrandItemLinkSource => {
  const link = readFragment(BrandItemLinkFragment, node);
  return {
    id: link.id,
    isPrimary: link.isPrimary,
    item: {
      id: link.item.id,
      type: link.item.type,
      name: link.item.name,
      vintage: "vintage" in link.item ? link.item.vintage : null,
    },
  };
};

export type BrandPlaceLinkSource = {
  id: string;
  relationshipType: string;
  place: { id: string; name: string };
};

export const brandPlaceFromLink = (link: BrandPlaceLinkSource): BrandPlace => ({
  id: link.id,
  relationship_type: link.relationshipType,
  place: { id: link.place.id, name: link.place.name },
});

export type BrandDetailSource = BrandCoreSource & {
  parentBrand?: BrandCoreSource | null;
  childBrands?: Connection<BrandCoreSource> | null;
  places?: Connection<BrandPlaceLinkSource> | null;
};

/**
 * The brand and its parent, children and places → `BrandDetailsItem`. The
 * item links are passed separately: they page, and the page's client half
 * appends to them.
 */
export const brandDetailsFromSource = (
  brand: BrandDetailSource,
  itemLinks: readonly BrandItemLinkSource[],
): BrandDetailsItem => ({
  id: brand.id,
  name: brand.name,
  description: brand.description ?? null,
  logo_url: brand.logoUrl ?? null,
  brand_type: brand.brandType ?? "other",
  parent_brand_id: brand.parentBrandId ?? null,
  created_at: brand.createdAt ?? "",
  parent_brand:
    brand.parentBrand === null || brand.parentBrand === undefined
      ? null
      : {
          id: brand.parentBrand.id,
          name: brand.parentBrand.name,
          brand_type: brand.parentBrand.brandType ?? "other",
        },
  child_brands: (brand.childBrands?.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name,
    brand_type: node.brandType ?? "other",
  })),
  item_brands: itemLinks.map(brandItemFromLink),
  place_brands: (brand.places?.edges ?? []).map(({ node }) =>
    brandPlaceFromLink(node),
  ),
});

/**
 * "Since 2019" without a `Date`: the old `new Date(created_at).getFullYear()`
 * could render a different year on the server (UTC) and in the browser
 * around New Year — a hydration mismatch (React #418).
 */
export const sinceYear = (createdAt: string): string | null => {
  const year = createdAt.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
};
