"use client";

/**
 * The rest of a brand's page under C1's `BrandShelf` (lot-cellars-shelves-16):
 * About (the logo or plate, the type chip, the description, the maker it is
 * part of and the makers it owns) and the places that carry it. The drinks
 * themselves are the shelf's.
 *
 * X23: no "Since <year>" — that was the catalog row's `created_at`. The
 * counts are the connections' `totalCount` when given, since the lists page;
 * `childrenFooter` and `placesFooter` hold each list's "Show more".
 */

import { isNotNil } from "ramda";
import type { ReactNode } from "react";
import { ICON_STROKE, Place } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { BrandPlate } from "./BrandCard";
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
  /** Stored or inferred (`inferBrandType`); null shows no chip. */
  brand_type: string | null;
  parent_brand_id?: string | null;
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
  /** How many places link the brand, when more than `place_brands` holds. */
  placeTotal?: number | null;
  /** Below the item list — the page's "Show more" while links remain. */
  /** Below the "Owns brands:" chips — "Show more" while sub-brands remain. */
  childrenFooter?: ReactNode;
  /** Below the place list — "Show more" while places remain. */
  placesFooter?: ReactNode;
};

const formatRelationshipType = (type: string) => {
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export const BrandDetails = ({
  brand,
  placeTotal,
  childrenFooter,
  placesFooter,
}: BrandDetailsProps) => {
  const hasAbout =
    isNotNil(brand.logo_url) ||
    isNotNil(brand.description) ||
    isNotNil(brand.brand_type) ||
    isNotNil(brand.parent_brand) ||
    (brand.child_brands?.length ?? 0) > 0;
  const placeCount = placeTotal ?? brand.place_brands.length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {hasAbout && (
        <section
          aria-labelledby="brand-about"
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4"
        >
          <h2 id="brand-about" className="t-title m-0 text-ink">
            About
          </h2>
          <div className="flex items-start gap-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-md">
              {isNotNil(brand.logo_url) ? (
                // biome-ignore lint/performance/noImgElement: `logoUrl` is any producer's host, not routable through /_next/image.
                <img
                  src={brand.logo_url}
                  alt={`${brand.name} logo`}
                  className="size-full object-contain"
                />
              ) : (
                <BrandPlate name={brand.name} />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              {isNotNil(brand.brand_type) && (
                <div className="flex flex-wrap gap-2">
                  <BrandTypeChip brandType={brand.brand_type} />
                </div>
              )}
              {isNotNil(brand.description) && (
                <p className="t-body m-0 text-ink-2">{brand.description}</p>
              )}
            </div>
          </div>

          {isNotNil(brand.parent_brand) && (
            <p className="t-body m-0 text-ink-2">
              Part of{" "}
              <Link
                href={`/brands/${brand.parent_brand.id}`}
                underline="always"
                className="text-ink"
              >
                {brand.parent_brand.name}
              </Link>
            </p>
          )}

          {isNotNil(brand.child_brands) && brand.child_brands.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="t-cap m-0 text-ink-2">Makers it owns</p>
              <div className="flex flex-wrap gap-2">
                {brand.child_brands.map((child) => (
                  <Link
                    key={child.id}
                    href={`/brands/${child.id}`}
                    underline="none"
                    className="t-body relative inline-flex min-h-11 items-center rounded-full border border-line px-3 text-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
              {childrenFooter}
            </div>
          )}
        </section>
      )}

      {placeCount > 0 && (
        <section
          aria-labelledby="brand-places"
          className="flex flex-col gap-2 rounded-lg border border-line bg-card p-4"
        >
          <h2
            id="brand-places"
            className="t-title m-0 flex items-center gap-2 text-ink"
          >
            Places
            <span className="t-cap tabular text-ink-3">{placeCount}</span>
          </h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {brand.place_brands.map((placeRelation) => (
              <li
                key={placeRelation.id}
                className="relative flex min-h-11 items-center gap-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  {/* The row is the target, not just the name. */}
                  <Link
                    href={`/places/${placeRelation.place.id}`}
                    underline="none"
                    overlay
                    className="t-head text-ink"
                  >
                    {placeRelation.place.name}
                  </Link>
                  <p className="t-cap m-0 text-ink-2">
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
          {placesFooter}
        </section>
      )}
    </div>
  );
};
