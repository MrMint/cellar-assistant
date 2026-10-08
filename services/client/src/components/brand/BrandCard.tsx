"use client";

/**
 * `82450ad1:src/components/brand/BrandCard.tsx`, restored. One change: a
 * logo renders through a plain `<img>` rather than `next/image`, because
 * `logoUrl` can be any host (see the inline note). The placeholder is still
 * `next/image` over the bundled `cellar1.png`.
 *
 * On the app primitives: a borderless `surface-1` tile (design §3.3) in
 * place of Joy's outlined `InteractiveCard`, the type chip from
 * `brand-type-display`, and the counts on a `surface-2` foot. The whole
 * tile is the target, as before: the title link (or, with only `onClick`,
 * a button) is stretched over it.
 */

import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import type { ReactNode } from "react";
import { Cocktail, ICON_STROKE, Place } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import cellar1 from "@/images/cellar1.png"; // Using as brand placeholder
import { BrandTypeChip } from "./brand-type-display";

export type BrandCardItem = {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  /** Stored or inferred (`inferBrandType`); null shows no chip. */
  brand_type: string | null;
  parent_brand_id?: string | null;
  item_count?: number; // Count of associated items
  place_count?: number; // Count of associated places
  parent_brand?: {
    id: string;
    name: string;
  } | null;
};

export type BrandCardProps = {
  brand: BrandCardItem;
  href?: string;
  onClick?: (brandId: string) => void;
};

/** The stretched target: the card's whole area, focus ring on the card. */
const STRETCHED =
  "after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50";

export const BrandCard = ({ brand, href, onClick }: BrandCardProps) => {
  const handleClick = isNotNil(onClick) ? () => onClick(brand.id) : undefined;
  const title = (
    <span className="type-headline block truncate">{brand.name}</span>
  );

  return (
    <div
      data-slot="brand-card"
      className="relative flex flex-col overflow-hidden rounded-lg bg-surface-1 transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-2"
    >
      <div className="relative flex aspect-[1.2] items-center justify-center overflow-hidden p-4 sm:aspect-square">
        {isNotNil(brand.logo_url) && (
          // biome-ignore lint/performance/noImgElement: `logoUrl` is any producer's host; no `remotePatterns` entry can name them all, so it is not routed through /_next/image.
          <img
            className="aspect-square h-auto max-h-full w-auto max-w-full object-contain"
            src={brand.logo_url}
            alt={`${brand.name} logo`}
            height={200}
            width={200}
            loading="lazy"
            decoding="async"
          />
        )}
        {isNil(brand.logo_url) && (
          <Image
            src={cellar1}
            alt={`${brand.name} placeholder`}
            fill
            placeholder="blur"
            className="object-contain"
          />
        )}

        {/* Brand type badge */}
        {isNotNil(brand.brand_type) && (
          <BrandTypeChip
            brandType={brand.brand_type}
            size="sm"
            className="pointer-events-none absolute top-2 right-2 z-10"
          />
        )}
      </div>

      {isNotNil(href) && (
        <CardText brand={brand}>
          <Link
            href={href}
            underline="none"
            onClick={handleClick}
            className={`text-ink-1 focus-visible:ring-0 ${STRETCHED}`}
          >
            {title}
          </Link>
        </CardText>
      )}

      {isNil(href) && isNotNil(handleClick) && (
        <CardText brand={brand}>
          <button
            type="button"
            onClick={handleClick}
            className={`w-full text-left text-ink-1 outline-none ${STRETCHED}`}
          >
            {title}
          </button>
        </CardText>
      )}

      {(isNotNil(brand.item_count) || isNotNil(brand.place_count)) && (
        <div className="flex items-center divide-x divide-line bg-surface-2">
          {/* Item count */}
          {isNotNil(brand.item_count) && (
            <Count icon={<Cocktail aria-hidden strokeWidth={ICON_STROKE} />}>
              {brand.item_count} {brand.item_count === 1 ? "item" : "items"}
            </Count>
          )}

          {/* Place count */}
          {isNotNil(brand.place_count) && (
            <Count icon={<Place aria-hidden strokeWidth={ICON_STROKE} />}>
              {brand.place_count} {brand.place_count === 1 ? "place" : "places"}
            </Count>
          )}
        </div>
      )}
    </div>
  );
};

/** Name, description and parent under the art. */
function CardText({
  brand,
  children,
}: {
  brand: BrandCardItem;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 p-4">
      {children}
      {isNotNil(brand.description) && (
        <p className="type-callout line-clamp-2 text-ink-1">
          {brand.description}
        </p>
      )}
      {isNotNil(brand.parent_brand) && (
        <p className="type-callout text-ink-2">
          Part of {brand.parent_brand.name}
        </p>
      )}
    </div>
  );
}

/** One count in the foot: the number, then its glyph. */
function Count({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="type-callout tabular flex flex-1 items-center justify-center gap-1.5 py-2 text-center text-ink-2 [&_svg]:size-4">
      <span>{children}</span>
      {icon}
    </p>
  );
}
