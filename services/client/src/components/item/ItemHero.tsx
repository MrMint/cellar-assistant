import type { ReactNode } from "react";
import { Link } from "@/components/app/Link";
import { MorphTitle } from "@/components/app/RouteTransition";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { LoveButton } from "./LoveButton";

/**
 * The item page's hero (Cellars-Bottles 01, combined item states): the
 * picture — a photo, else the item's label plate — runs the column's width
 * at 300 on a phone, under the bar's glass discs, and fades into the page;
 * the name sits *below* it (never on the photo, so it reads at 4.5:1 on any
 * label), with Want to try and the heart at its right and the subtitle line under it:
 * "maker · style · strength", the maker a link to its brand page (D1).
 *
 * From `md` (and in the desktop pane) the picture is a rounded square beside
 * the words.
 */
export function ItemHero({
  itemId,
  type,
  name,
  isFavorite,
  isWantToTry,
  producer,
  subtitle,
  picture,
  stateLine,
  bleed = true,
}: {
  itemId: string;
  type: ApiItemType;
  name: string;
  isFavorite: boolean;
  /** X08's bookmark (Save), beside the heart. */
  isWantToTry: boolean;
  producer: { brandId: string; name: string } | null;
  subtitle: readonly (string | null | undefined)[];
  /** `ItemImage` (or the bottle's capture tile), already shaped. */
  picture: ReactNode;
  /** The selected bottle's state, on a bottle's URL ("In Garage · Open"). */
  stateLine?: ReactNode;
  /** Runs edge to edge under the bar on a phone; off in the desktop pane. */
  bleed?: boolean;
}) {
  const phrases = subtitle.filter(
    (phrase): phrase is string =>
      phrase !== null &&
      phrase !== undefined &&
      phrase !== "" &&
      phrase !== producer?.name,
  );
  return (
    <header
      data-testid="item-hero"
      className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6"
    >
      <div
        data-slot="item-hero-picture"
        className={
          bleed
            ? "relative -mx-4 -mt-4 overflow-hidden md:mx-0 md:mt-0 md:w-64 md:shrink-0 md:rounded-lg"
            : "relative w-40 shrink-0 overflow-hidden rounded-lg"
        }
      >
        {picture}
        {bleed && (
          // The fade into the page under the photo (phone only).
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-background md:hidden"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          {/* B05: where a card's title lands (named for this page's path). */}
          <MorphTitle>
            <h1 className="t-title min-w-0 flex-1 break-words text-ink">
              {name}
            </h1>
          </MorphTitle>
          <LoveButton
            itemId={itemId}
            type={type}
            name={name}
            isFavorite={isFavorite}
            wantToTry={isWantToTry}
          />
        </div>
        {(producer !== null || phrases.length > 0) && (
          <p data-slot="item-subtitle" className="t-body text-ink-2">
            {producer !== null && (
              <Link
                href={`/brands/${producer.brandId}`}
                underline="hover"
                className="text-ink-2"
              >
                {producer.name}
              </Link>
            )}
            {producer !== null && phrases.length > 0 && " · "}
            {phrases.join(" · ")}
          </p>
        )}
        {stateLine}
      </div>
    </header>
  );
}
