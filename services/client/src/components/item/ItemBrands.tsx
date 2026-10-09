import type { ReactNode } from "react";
import { Business } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ItemSection } from "./ItemSection";

/**
 * The type word, or null: a brand whose type is neither stored nor inferable
 * (`inferBrandType`, X23) says nothing rather than "Other".
 */
const formatBrandType = (brandType: string | null) => {
  if (!brandType) return null;
  return brandType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export type ItemBrand = {
  id: string;
  is_primary?: boolean | null;
  brand: {
    id: string;
    name: string;
    logo_url?: string | null;
    brand_type: string | null;
  };
};

export type ItemBrandsProps = {
  brands: ItemBrand[];
  title?: string;
  /**
   * D8: the creator's one-tap correction ("Wrong brand? Change it"), drawn
   * under the list — and, when the item has no brand yet, as the section's
   * only content, so a missing brand can be added from here too.
   */
  change?: ReactNode;
};

/** The brand the page leads with: the primary link, or the first. */
export const shownItemBrand = (
  brands: readonly ItemBrand[],
): { brandId: string; name: string } | null => {
  const link = brands.find((b) => b.is_primary) ?? brands[0];
  return link === undefined
    ? null
    : { brandId: link.brand.id, name: link.brand.name };
};

/** The logo tile: the brand's own logo, or the business glyph on a surface. */
function BrandLogo({
  brand,
  primary,
}: {
  brand: ItemBrand["brand"];
  primary: boolean;
}) {
  const size = primary ? 48 : 40;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2",
        primary ? "size-12" : "size-10",
      )}
    >
      {brand.logo_url !== null && brand.logo_url !== undefined ? (
        // biome-ignore lint/performance/noImgElement: external logos have no `remotePatterns` entry (see below).
        <img
          src={brand.logo_url}
          alt={`${brand.name} logo`}
          width={size}
          height={size}
          className="size-full object-contain"
        />
      ) : (
        <Business
          aria-hidden
          className={cn("text-ink-3", primary ? "size-6" : "size-5")}
        />
      )}
    </span>
  );
}

/**
 * `82450ad1:src/components/item/ItemBrands.tsx`, restored. Fed by
 * `Item.brands` (`isPrimary`, `brand.brandType`, `brand.logoUrl`) through the
 * adapter. Logos are external URLs with no `remotePatterns` entry, so they go
 * into a plain `<img>` rather than `next/image`.
 *
 * The other brands' type chip was tinted by type (brewery amber, winery red,
 * …) with Joy's palette; the type word is the information, so the chips are
 * one neutral outline now (design §3.1: no decorative hues).
 */
export const ItemBrands = ({
  brands,
  title = "Brands",
  change,
}: ItemBrandsProps) => {
  if (brands.length === 0) {
    return change === undefined ? null : (
      <ItemSection title={title}>
        <p className="type-callout text-ink-3">No brand recorded yet.</p>
        {change}
      </ItemSection>
    );
  }

  const primaryBrand = brands.find((b) => b.is_primary);
  const otherBrands = brands.filter((b) => !b.is_primary);

  return (
    <ItemSection title={`${title} (${brands.length})`}>
      <ul className="flex flex-col gap-4">
        {primaryBrand && (
          <li className="flex items-center gap-4">
            <BrandLogo brand={primaryBrand.brand} primary />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/brands/${primaryBrand.brand.id}`}
                  underline="always"
                  className="type-body font-medium text-ink-1"
                >
                  {primaryBrand.brand.name}
                </Link>
                <Badge variant="secondary">Primary</Badge>
              </div>
              {primaryBrand.brand.brand_type !== null && (
                <p className="type-callout text-ink-2">
                  {formatBrandType(primaryBrand.brand.brand_type)}
                </p>
              )}
            </div>
          </li>
        )}

        {otherBrands.map((brandRelation) => (
          <li key={brandRelation.id} className="flex items-center gap-4">
            <BrandLogo brand={brandRelation.brand} primary={false} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/brands/${brandRelation.brand.id}`}
                underline="always"
                className="type-callout text-ink-1"
              >
                {brandRelation.brand.name}
              </Link>
              {brandRelation.brand.brand_type !== null && (
                <p className="type-footnote">
                  {formatBrandType(brandRelation.brand.brand_type)}
                </p>
              )}
            </div>
            {brandRelation.brand.brand_type !== null && (
              <Badge variant="outline">
                {formatBrandType(brandRelation.brand.brand_type)}
              </Badge>
            )}
          </li>
        ))}
      </ul>
      {change}
    </ItemSection>
  );
};
