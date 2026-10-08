"use client";

/**
 * `82450ad1:src/components/brand/BrandDetails.tsx`, restored. Changes:
 *
 * - The logo is a plain `<img>` (any host; see `BrandCard`).
 * - "Since" slices the year from the ISO string (`sinceYear`): the old
 *   `new Date(...).getFullYear()` could differ between server and browser.
 * - The two counts are the connections' `totalCount` when given, since the
 *   lists now page; `itemsFooter`, `childrenFooter` and `placesFooter` are
 *   where the page puts each list's "Show more" (the old page read every row
 *   at once and had none).
 * - On the app primitives: borderless `surface-1` blocks in place of Joy
 *   `Card`s (design §3.3), the type chip from `brand-type-display`, and
 *   `app/Link`s. Same headings, copy, order and links.
 */

import Image from "next/image";
import { isNotNil } from "ramda";
import type { ReactNode } from "react";
import { ICON_STROKE, Place } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Badge } from "@/components/ui/badge";
import cellar1 from "@/images/cellar1.png";
import { sinceYear } from "./adapter";
import { BrandTypeChip } from "./brand-type-display";

export type BrandItem = {
  id: string;
  is_primary?: boolean;
  wine_id?: string | null;
  beer_id?: string | null;
  spirit_id?: string | null;
  coffee_id?: string | null;
  sake_id?: string | null;
  tea_id?: string | null;
  wine?: { id: string; name: string; vintage?: string | null } | null;
  beer?: { id: string; name: string } | null;
  spirit?: { id: string; name: string } | null;
  coffee?: { id: string; name: string } | null;
  sake?: { id: string; name: string } | null;
  tea?: { id: string; name: string } | null;
};

export type BrandPlace = {
  id: string;
  relationship_type: string;
  place: {
    id: string;
    name: string;
  };
};

export type BrandDetailsItem = {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  brand_type: string;
  parent_brand_id?: string | null;
  created_at: string;
  parent_brand?: {
    id: string;
    name: string;
    brand_type: string;
  } | null;
  child_brands?: {
    id: string;
    name: string;
    brand_type: string;
  }[];
  item_brands: BrandItem[];
  place_brands: BrandPlace[];
};

export type BrandDetailsProps = {
  brand: BrandDetailsItem;
  /** How many items carry the brand, when more than `item_brands` holds. */
  itemTotal?: number | null;
  /** How many places link the brand, when more than `place_brands` holds. */
  placeTotal?: number | null;
  /** Below the item list — the page's "Show more" while links remain. */
  itemsFooter?: ReactNode;
  /** Below the "Owns brands:" chips — "Show more" while sub-brands remain. */
  childrenFooter?: ReactNode;
  /** Below the place list — "Show more" while places remain. */
  placesFooter?: ReactNode;
};

const getItemDisplay = (item: BrandItem) => {
  if (isNotNil(item.wine)) {
    const vintage = item.wine.vintage ? `${item.wine.vintage} ` : "";
    return {
      name: `${vintage}${item.wine.name}`,
      type: "wine" as const,
      itemId: item.wine.id,
      href: `/wines/${item.wine.id}`,
    };
  }

  if (isNotNil(item.beer)) {
    return {
      name: item.beer.name,
      type: "beer" as const,
      itemId: item.beer.id,
      href: `/beers/${item.beer.id}`,
    };
  }

  if (isNotNil(item.spirit)) {
    return {
      name: item.spirit.name,
      type: "spirit" as const,
      itemId: item.spirit.id,
      href: `/spirits/${item.spirit.id}`,
    };
  }

  if (isNotNil(item.coffee)) {
    return {
      name: item.coffee.name,
      type: "coffee" as const,
      itemId: item.coffee.id,
      href: `/coffees/${item.coffee.id}`,
    };
  }

  if (isNotNil(item.sake)) {
    return {
      name: item.sake.name,
      type: "sake" as const,
      itemId: item.sake.id,
      href: `/sakes/${item.sake.id}`,
    };
  }

  if (isNotNil(item.tea)) {
    return {
      name: item.tea.name,
      type: "tea" as const,
      itemId: item.tea.id,
      href: `/teas/${item.tea.id}`,
    };
  }

  return null;
};

const formatRelationshipType = (type: string) => {
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export const BrandDetails = ({
  brand,
  itemTotal,
  placeTotal,
  itemsFooter,
  childrenFooter,
  placesFooter,
}: BrandDetailsProps) => {
  const since = sinceYear(brand.created_at);
  const groupedItems = brand.item_brands.reduce(
    (acc, item) => {
      const display = getItemDisplay(item);
      if (display) {
        if (!acc[display.type]) {
          acc[display.type] = [];
        }
        acc[display.type].push({ ...display, isPrimary: item.is_primary });
      }
      return acc;
    },
    {} as Record<
      string,
      Array<{
        name: string;
        type: string;
        itemId: string;
        href: string;
        isPrimary?: boolean;
      }>
    >,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Brand Header */}
      <div className="grid grid-cols-1 gap-4 rounded-lg bg-surface-1 p-4 md:grid-cols-[1fr_2fr]">
        <div className="relative aspect-square overflow-hidden rounded-md">
          {isNotNil(brand.logo_url) ? (
            // biome-ignore lint/performance/noImgElement: `logoUrl` is any producer's host, not routable through /_next/image.
            <img
              src={brand.logo_url}
              alt={`${brand.name} logo`}
              className="size-full object-contain"
            />
          ) : (
            <Image
              src={cellar1}
              alt={`${brand.name} placeholder`}
              fill
              className="object-contain"
            />
          )}
        </div>
        <div className="flex flex-col gap-4 md:py-2">
          <div>
            <h1 className="type-title-1">{brand.name}</h1>
            {since !== null && (
              <p className="type-callout text-ink-2">Since {since}</p>
            )}
          </div>

          {isNotNil(brand.description) && (
            <p className="type-body">{brand.description}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <BrandTypeChip brandType={brand.brand_type} />
          </div>

          {/* Brand hierarchy */}
          {isNotNil(brand.parent_brand) && (
            <p className="type-callout text-ink-2">
              Part of:{" "}
              <Link
                href={`/brands/${brand.parent_brand.id}`}
                underline="always"
                className="font-medium text-ink-1"
              >
                {brand.parent_brand.name}
              </Link>
            </p>
          )}

          {isNotNil(brand.child_brands) && brand.child_brands.length > 0 && (
            <div>
              <p className="type-callout mb-2 text-ink-2">Owns brands:</p>
              <div className="flex flex-wrap gap-2">
                {brand.child_brands.map((child) => (
                  <Link
                    key={child.id}
                    href={`/brands/${child.id}`}
                    underline="none"
                    className="relative inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-ink-1 text-sm transition-colors duration-(--ca-dur-micro) ease-standard after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:bg-surface-3"
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
              {childrenFooter}
            </div>
          )}
        </div>
      </div>

      {/* Items and Places */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Associated Items */}
        <section className="flex flex-col rounded-lg bg-surface-1 p-4">
          <h2 className="type-title-2 mb-4">
            Associated Items ({itemTotal ?? brand.item_brands.length})
          </h2>

          {Object.keys(groupedItems).length === 0 ? (
            <p className="type-callout text-ink-2">
              No items associated with this brand yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(groupedItems).map(([type, items]) => (
                <div key={type}>
                  <h3 className="type-callout mb-2 font-medium capitalize">
                    {type}s ({items.length})
                  </h3>
                  <ul className="flex flex-col">
                    {items.map((item) => (
                      // The row is the target (44 px), not just the name.
                      <li
                        key={item.itemId}
                        className="relative flex min-h-11 items-center gap-2"
                      >
                        <Link
                          href={item.href}
                          underline="always"
                          overlay
                          className="type-callout text-ink-1"
                        >
                          {item.name}
                        </Link>
                        {item.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {itemsFooter}
        </section>

        {/* Associated Places */}
        <section className="flex flex-col rounded-lg bg-surface-1 p-4">
          <h2 className="type-title-2 mb-4">
            Associated Places ({placeTotal ?? brand.place_brands.length})
          </h2>

          {brand.place_brands.length === 0 ? (
            <p className="type-callout text-ink-2">
              No places associated with this brand yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {brand.place_brands.map((placeRelation) => (
                <li
                  key={placeRelation.id}
                  className="relative flex items-center gap-4 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    {/* The row is the target, not just the name. */}
                    <Link
                      href={`/places/${placeRelation.place.id}`}
                      underline="always"
                      overlay
                      className="type-body text-ink-1"
                    >
                      {placeRelation.place.name}
                    </Link>
                    <p className="type-callout text-ink-2">
                      {formatRelationshipType(placeRelation.relationship_type)}
                    </p>
                  </div>
                  <Place
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="size-5 text-ink-3"
                  />
                </li>
              ))}
            </ul>
          )}
          {placesFooter}
        </section>
      </div>
    </div>
  );
};
