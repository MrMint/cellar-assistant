"use client";

import Image from "next/image";
import { always, cond, equals, isNil, isNotNil } from "ramda";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { useMutation } from "urql";
import { Comment, ICON_STROKE, Love } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Score } from "@/components/app/Score";
import { TypeChip } from "@/components/app/TypeChip";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import sake1 from "@/images/sake1.png";
import spirit1 from "@/images/spirit1.png";
import tea1 from "@/images/tea1.png";
import wine1 from "@/images/wine1.png";
import { ToggleFavoriteMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { formatVintage, getNextPlaceholder } from "@/utilities";
import type { ItemCardItem } from "./types";

export type { ItemCardItem } from "./types";

const getFallback = (type: ItemTypeValue) =>
  cond([
    [equals("BEER"), always({ image: beer1, alt: "A beer glass" })],
    [equals("WINE"), always({ image: wine1, alt: "A wine bottle" })],
    [
      equals("COFFEE"),
      always({ image: coffee1, alt: "A bag of coffee beans" }),
    ],
    [equals("SPIRIT"), always({ image: spirit1, alt: "A bottle of spirits" })],
    [equals("SAKE"), always({ image: sake1, alt: "A sake bottle" })],
    [equals("TEA"), always({ image: tea1, alt: "A tea container" })],
  ])(type);

export type ItemCardProps = {
  item: ItemCardItem;
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemTypeValue;
};

/**
 * One footer section: centred, an equal share of the row. Every section has
 * the same zero horizontal padding — `flex-1` shares out what is left *after*
 * padding, so a padded heart button took a wider third and squeezed the score
 * against the card's edge.
 */
const FOOTER_CELL =
  "flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-0 text-ink-1";

/**
 * A hairline between two footer sections — only *between* two that are shown.
 * Joy's card drew the old unconditional dividers against its own border, where
 * a trailing one vanished; this tile has no border, so one with nothing after
 * it hangs inside the rounded corner.
 */
const FooterSeparator = () => (
  <Separator
    orientation="vertical"
    decorative={false}
    className="data-[orientation=vertical]:h-6"
  />
);

/**
 * The card clips its children (`overflow-hidden`, for the image's corners),
 * and a focus ring is a shadow drawn *outside* its element — so a ring on
 * anything flush with the card's edge is clipped away, and the stretched
 * target (exactly the card's box) would show none at all. Every focusable
 * thing in the card draws its ring inside instead.
 */
const RING_INSIDE = "focus-visible:ring-inset";

/**
 * `82450ad1:src/components/item/ItemCard/index.tsx`, restored, then moved off
 * Joy onto the app's tokens: a surface-2 tile (radius 12, no border), the
 * image, the title block, and the footer of favourite · reviews · score —
 * same sections, same order, same rules for when each shows.
 *
 * Four substitutions from the restore, each listed in
 * `src/components/LEGACY-RESTORE.md`:
 *
 * 1. **The image** is `next/image` on the presigned `displayImageUrl` rather
 *    than on a Nhost storage URL — same props as before. Presigned reads are
 *    stable per window now, so the optimizer's cache can hit
 *    (`next.config.mjs`, `imagesConfig`).
 * 2. **The favourite toggle** is `toggleFavorite` (one mutation that reports
 *    the state after the toggle) instead of the add/delete server actions
 *    keyed on a favourite row id. The optimistic flip and revert are the old
 *    ones.
 * 3. **The link** goes to `href` as given. The old card ignored the value and
 *    rebuilt a *relative* `wines/<id>`, which resolved differently per page
 *    (§7, "Relative hrefs everywhere"); callers now pass an absolute href.
 * 4. **`ItemTypeValue`** is the SDL's `ItemType`, not the shared package's.
 *
 * And from the shadcn move (design-direction §3): the type is a `TypeChip`
 * (glyph and word — a glyph never stands alone on touch), the score is
 * `Score` (one decimal, only when not zero), the heart is claret rather than
 * `red`, and a score the viewer has reviewed is marked in brass — the colour
 * of their own stars in `RatingInput` — instead of a literal gold.
 *
 * The whole tile is the target. With an `href` that is the title link,
 * stretched over the card (`overlay`), and `onClick` rides on it (callers use
 * it to save the scroll position first); with only `onClick`, a stretched
 * button named for the item. The favourite toggle sits above either.
 */
export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [localFavorite, setLocalFavorite] = useState(item.isFavorite ?? false);
  const [, toggleFavorite] = useMutation(ToggleFavoriteMutation);
  const fallback = getFallback(type);

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    startTransition(async () => {
      const previousFavorite = localFavorite;
      // Optimistic update: show the new state immediately
      setLocalFavorite(!previousFavorite);
      try {
        const response = await toggleFavorite({ itemId: item.itemId, type });
        const result = unwrapResult(
          response.data?.toggleFavorite,
          "ToggleFavoritePayload",
        );
        if (result.ok) {
          // The payload is the state *after* the toggle; trust it over the guess.
          setLocalFavorite(result.data.favorited);
        } else {
          // Revert on failure
          setLocalFavorite(previousFavorite);
          console.error("Failed to toggle favorite:", result.error.message);
        }
      } catch (error) {
        // Revert on unexpected error
        setLocalFavorite(previousFavorite);
        console.error("Error toggling favorite:", error);
      }
    });
  };

  const placeholder = getNextPlaceholder(item.placeholder);
  const title =
    type === "WINE" ? `${formatVintage(item.vintage)} ${item.name}` : item.name;
  const handleClick = isNotNil(onClick) ? () => onClick(item.id) : undefined;
  const interactive = isNotNil(href) || isNotNil(onClick);
  const hasFavorites = isNotNil(item.favoriteCount);
  const hasReviews = isNotNil(item.reviewCount);
  const hasScore = isNotNil(item.score);

  const subtitle = (
    <div className="type-footnote flex items-center justify-between gap-1">
      <span className="min-w-0 truncate">{item.subtitle ?? " "}</span>
      <TypeChip type={type} />
    </div>
  );

  return (
    <div
      data-slot="item-card"
      className={cn(
        "relative flex flex-col overflow-hidden rounded-md bg-surface-2 text-ink-1",
        interactive &&
          "transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-3",
      )}
    >
      <div className="relative aspect-6/5 overflow-hidden sm:aspect-square">
        {isNotNil(item.displayImageUrl) && (
          <Image
            className="size-full object-cover"
            src={item.displayImageUrl}
            alt={fallback.alt}
            height={400}
            width={400}
            placeholder={placeholder}
          />
        )}
        {isNil(item.displayImageUrl) && (
          <Image
            className="object-cover"
            src={fallback.image}
            alt={fallback.alt}
            fill
            placeholder="blur"
          />
        )}
      </div>
      {isNotNil(href) && (
        <div className="flex flex-col gap-1 p-3">
          <Link
            overlay
            underline="none"
            href={href}
            onClick={handleClick}
            className="type-headline truncate text-ink-1 focus-visible:after:rounded-md focus-visible:after:ring-inset"
          >
            {title}
          </Link>
          {subtitle}
        </div>
      )}
      {isNil(href) && isNotNil(onClick) && (
        <div className="flex flex-col gap-1 p-3">
          <p className="type-headline truncate">{title}</p>
          {subtitle}
          <button
            type="button"
            aria-label={title}
            onClick={handleClick}
            className={cn(
              "absolute inset-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              RING_INSIDE,
            )}
          />
        </div>
      )}
      <div className="flex items-center border-line border-t">
        {hasFavorites && (
          <Button
            variant="ghost"
            // `disabled:pointer-events-auto`: while the toggle is pending it
            // still takes the tap (a disabled button swallows it) — with the
            // vendored `pointer-events-none`, a quick second tap on the heart
            // fell through to the stretched link and left the page.
            className={cn(
              FOOTER_CELL,
              "relative z-10 rounded-none has-[>svg]:px-0 disabled:pointer-events-auto",
              RING_INSIDE,
            )}
            onClick={handleFavoriteClick}
            disabled={isPending}
            aria-busy={isPending || undefined}
            aria-pressed={localFavorite}
          >
            <span className="type-headline tabular">{item.favoriteCount}</span>
            <span className="sr-only"> loves</span>
            {isPending ? (
              <Spinner className="size-6 text-ink-3" />
            ) : (
              <Love
                aria-hidden
                strokeWidth={ICON_STROKE}
                className={cn(
                  "size-6",
                  localFavorite ? "fill-brand text-brand" : "text-ink-2",
                )}
              />
            )}
          </Button>
        )}
        {hasFavorites && hasReviews && <FooterSeparator />}
        {hasReviews && (
          <div className={FOOTER_CELL}>
            <span className="type-headline tabular">{item.reviewCount}</span>
            <span className="sr-only"> reviews</span>
            <Comment
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 text-ink-2"
            />
          </div>
        )}
        {(hasFavorites || hasReviews) && hasScore && <FooterSeparator />}
        {hasScore && (
          <div
            className={FOOTER_CELL}
            data-reviewed={item.reviewed === true || undefined}
          >
            <Score
              value={item.score}
              className={cn(
                "type-headline text-ink-1 [&_svg]:size-5",
                item.reviewed === true
                  ? "[&_svg]:text-primary"
                  : "[&_svg]:text-ink-3",
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};
