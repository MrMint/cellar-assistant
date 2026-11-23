import type { ReactNode } from "react";
import { Link } from "@/components/app/Link";
import { MorphTitle } from "@/components/app/RouteTransition";
import { TypeChip } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { LoveButton } from "./LoveButton";

/**
 * The item page's hero (design §2 "Detail screens": a hero, then a state
 * line, then sections): the picture — a photo, else the item's LabelPlate —
 * then the producer, the name as the page's one heading, Love beside it, and
 * the subtitle line.
 *
 * The producer is a link to its brand page: D1 put Brands "on item pages
 * and search", and this is the item-page half of that. On a phone the
 * picture runs the width of the column at 4:3; from `sm` it sits beside the
 * words.
 */
export function ItemHero({
  itemId,
  type,
  name,
  isFavorite,
  producer,
  subtitle,
  picture,
  stateLine,
}: {
  itemId: string;
  type: ApiItemType;
  name: string;
  isFavorite: boolean;
  producer: { brandId: string; name: string } | null;
  subtitle: readonly (string | null | undefined)[];
  /** `ItemImage` (or the bottle's capture tile), already shaped. */
  picture: ReactNode;
  /** The selected bottle's state, on a bottle's URL ("In Garage · Open"). */
  stateLine?: ReactNode;
}) {
  const phrases = subtitle.filter(
    (phrase): phrase is string =>
      phrase !== null && phrase !== undefined && phrase !== "",
  );
  return (
    <header
      data-testid="item-hero"
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6"
    >
      <div className="w-full sm:w-56 sm:shrink-0">{picture}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <TypeChip type={type} />
          {producer !== null && (
            <Link
              href={`/brands/${producer.brandId}`}
              underline="hover"
              className="type-callout min-w-0 truncate font-medium text-ink-2"
            >
              {producer.name}
            </Link>
          )}
        </div>
        <div className="flex items-start gap-2">
          {/* B05: where a card's title lands (named for this page's path). */}
          <MorphTitle>
            <h1 className="type-title-1 min-w-0 flex-1 break-words text-ink-1">
              {name}
            </h1>
          </MorphTitle>
          <LoveButton
            itemId={itemId}
            type={type}
            name={name}
            isFavorite={isFavorite}
          />
        </div>
        {phrases.length > 0 && (
          <p className="type-callout text-ink-2">{phrases.join(" · ")}</p>
        )}
        {stateLine}
      </div>
    </header>
  );
}
