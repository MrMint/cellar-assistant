"use client";

import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import type { MouseEvent } from "react";
import { useCallback } from "react";
import { useMutation } from "urql";
import { Comment, ICON_STROKE, Love } from "@/components/app/icons";
import { LabelPlate, type PlateStyleFields } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { MorphTitle } from "@/components/app/RouteTransition";
import { Score } from "@/components/app/Score";
import { TogglePop } from "@/components/app/TogglePop";
import { TypeChip } from "@/components/app/TypeChip";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useOptimisticToggle } from "@/hooks/useOptimisticToggle";
import { SetFavoriteMutation } from "@/lib/api/items";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { formatItemVintage, getNextPlaceholder } from "@/utilities";
import type { ItemCardItem } from "./types";

export type { ItemCardItem } from "./types";

/** The photo's alt text, per type, as the old card had it. */
const PHOTO_ALT: Readonly<Record<ItemTypeValue, string>> = {
  BEER: "A beer glass",
  WINE: "A wine bottle",
  COFFEE: "A bag of coffee beans",
  SPIRIT: "A bottle of spirits",
  SAKE: "A sake bottle",
  TEA: "A tea container",
};

export type ItemCardProps = {
  /**
   * The card's item. `styleFields` (imagery's style vessels, H-2) rides
   * beside `ItemCardItem` until `types.ts` carries it: the adapters set it.
   */
  item: ItemCardItem & { styleFields?: PlateStyleFields | null };
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
 * The favourite count to draw: the server's, moved by one when the drawn
 * state differs from the state that count was taken in. Never below zero.
 */
export const shownFavoriteCount = (
  count: number,
  wasFavorite: boolean,
  isFavorite: boolean,
): number => Math.max(0, count + Number(isFavorite) - Number(wasFavorite));

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
 * 2. **The favourite toggle** is `setFavorite` (one mutation that sets the
 *    state asked for and reports it) instead of the add/delete server actions
 *    keyed on a favourite row id. The flip is optimistic for real now (X24):
 *    the old one set its state inside the async transition that awaited the
 *    write, so the heart held — behind a spinner — until the server answered.
 *    `useOptimisticToggle` draws the tapped state (and the count with it) in
 *    the tap's frame, pops the heart, and falls back with a toast if the
 *    write is refused. It sets rather than flips (wave B: the old
 *    `toggleFavorite` flipped, so a retried request undid itself), and the
 *    hook still writes again only if the payload's `favorited` is not the
 *    last tapped state.
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
  const [, setFavorite] = useMutation(SetFavoriteMutation);
  const wasFavorite = item.isFavorite ?? false;

  const commitFavorite = useCallback(
    async (next: boolean) => {
      const response = await setFavorite({
        itemId: item.itemId,
        type,
        favorited: next,
      });
      if (response.error) {
        return {
          ok: false as const,
          message: failureFromTransport(response.error).message,
        };
      }
      const result = unwrapResult(
        response.data?.setFavorite,
        "SetFavoritePayload",
      );
      // The payload is the state *after* the call; trust it over the guess.
      return result.ok
        ? { ok: true as const, value: result.data.favorited }
        : { ok: false as const, message: result.error.message };
    },
    [setFavorite, item.itemId, type],
  );
  const favorite = useOptimisticToggle({
    value: wasFavorite,
    commit: commitFavorite,
    onError: (message) =>
      notify("Couldn't update your favourites", {
        tone: "error",
        description: message,
      }),
  });

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    favorite.toggle();
  };

  const placeholder = getNextPlaceholder(item.placeholder);
  // `item.vintage` is already the display year (or "NV", X19); a wine
  // without one used to render as "undefined Name".
  const vintage = type === "WINE" ? formatItemVintage(type, item.vintage) : "";
  const title = vintage ? `${vintage} ${item.name}` : item.name;
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
            alt={PHOTO_ALT[type]}
            height={400}
            width={400}
            placeholder={placeholder}
          />
        )}
        {isNil(item.displayImageUrl) && (
          // No photo: the item's own LabelPlate (N28), not the type's clip
          // art — so two wines no longer look identical.
          <LabelPlate
            type={type}
            plate={item.plate ?? { name: item.name }}
            styleFields={item.styleFields}
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
            className="type-headline min-w-0 text-ink-1 focus-visible:after:rounded-md focus-visible:after:ring-inset"
          >
            {/* B05: the title flies into the item page's heading. */}
            <MorphTitle href={href} className="truncate">
              {title}
            </MorphTitle>
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
            // Never disabled: a quick second tap is a second toggle, not a
            // tap that falls through to the stretched link and leaves the
            // page (a disabled button would swallow it).
            className={cn(
              FOOTER_CELL,
              "relative z-10 rounded-none has-[>svg]:px-0",
              RING_INSIDE,
            )}
            onClick={handleFavoriteClick}
            aria-busy={favorite.pending || undefined}
            aria-pressed={favorite.on}
          >
            <span className="type-headline tabular">
              {shownFavoriteCount(
                item.favoriteCount ?? 0,
                wasFavorite,
                favorite.on,
              )}
            </span>
            <span className="sr-only"> loves</span>
            <TogglePop on={favorite.on} pop={favorite.pending}>
              <Love
                aria-hidden
                strokeWidth={ICON_STROKE}
                className={cn(
                  "size-6 transition-colors duration-(--ca-dur-micro) ease-standard",
                  favorite.on ? "fill-brand text-brand" : "text-ink-2",
                )}
              />
            </TogglePop>
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
