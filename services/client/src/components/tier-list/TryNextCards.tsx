"use client";

import { type ReactNode, useMemo } from "react";
import { useQuery } from "urql";
import { ICON_STROKE, Place } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemCardFromFragment } from "@/components/item/ItemCard/adapter";
import { ItemImage } from "@/components/item/ItemImage";
import { Skeleton } from "@/components/ui/skeleton";
import type { WantToTryTarget } from "@/components/want-to-try/adapter";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { unwrapResult } from "@/lib/api/result";
import type { LabelPlateData } from "@/lib/items/label-plate";
import { placeEntrySubtitle } from "./adapter";
import { tryNextReason } from "./add-entry";
import { TierListTryNextQuery, TRY_NEXT_PAGE_SIZE } from "./queries";

/** One card, ready to draw. */
export type TryNextCard = {
  key: string;
  href: string;
  name: string;
  /** Why it is here, in words — never a score. */
  reason: string;
  target: WantToTryTarget;
  saved: boolean;
  /** An item's look: its photo, else its LabelPlate. Null for a place. */
  item: {
    type: ApiItemType;
    imageUrl: string | null;
    placeholder: string | null;
    plate: LabelPlateData;
  } | null;
  /** A place's line: "Wine Bar · Austin · US". */
  subtitle: string | null;
};

const ITEM_TYPES = new Set(["WINE", "BEER", "SPIRIT", "COFFEE", "SAKE", "TEA"]);

/**
 * X16's grounded "Try this next": catalog cards, each one there for a fact
 * you can check — a friend's top band, or the entry on this list (or the
 * bottle you love) it sits next to in the catalog — and a Want to try
 * bookmark (X08). Deterministic: no model is asked, so it shows whatever the
 * AI provider. Empty is said, for the owner, as what would fill it; anyone
 * else sees nothing rather than an empty box — not even the section's
 * heading, which is why the caller hands its section in as `frame` instead
 * of wrapping this component in it.
 */
export function TryNextCards({
  tierListId,
  isOwner,
  frame,
}: {
  tierListId: string;
  isOwner: boolean;
  /** The section around the cards; not drawn when there is nothing to show. */
  frame: (body: ReactNode) => ReactNode;
}) {
  const [{ data, fetching, error }] = useQuery({
    query: TierListTryNextQuery,
    variables: { id: tierListId, first: TRY_NEXT_PAGE_SIZE },
    // The list, your loves and your friends' lists move between visits: the
    // last answer shows at once and a fresh one replaces it.
    requestPolicy: "cache-and-network",
  });

  const cards = useMemo((): TryNextCard[] | null => {
    if (data === undefined) return null;
    const result = unwrapResult(data.tierList, "TierList");
    if (!result.ok) return [];
    return result.data.tryNext.edges.flatMap(({ node }): TryNextCard[] => {
      const reason = tryNextReason(
        {
          reason: node.reason,
          friendName: node.friend?.displayName ?? null,
          friendBand: node.friendBand,
          friendCount: node.friendCount,
          likeName: node.likeName,
          likeBand: node.likeBand,
        },
        isOwner,
      );
      // A card it cannot explain is not shown (abstention, D25).
      if (reason === null) return [];
      if (
        node.item !== null &&
        ITEM_TYPES.has(node.item.__typename.toUpperCase())
      ) {
        const card = itemCardFromFragment(node.item);
        const type = node.item.__typename.toUpperCase() as ApiItemType;
        return [
          {
            key: `item:${node.item.id}`,
            href: `/${type.toLowerCase()}s/${node.item.id}`,
            name: card.name,
            reason,
            target: { kind: "ITEM", itemType: type, itemId: node.item.id },
            saved: node.item.isWantToTry,
            item: {
              type,
              imageUrl: card.displayImageUrl ?? null,
              placeholder: card.placeholder ?? null,
              plate: card.plate ?? { name: card.name },
            },
            subtitle: null,
          },
        ];
      }
      if (node.place !== null) {
        return [
          {
            key: `place:${node.place.id}`,
            href: `/places/${node.place.id}`,
            name: node.place.displayName ?? node.place.name,
            reason,
            target: { kind: "PLACE", placeId: node.place.id },
            saved: node.place.myInteraction?.wantToVisit ?? false,
            item: null,
            subtitle: placeEntrySubtitle(node.place) || null,
          },
        ];
      }
      return [];
    });
  }, [data, isOwner]);

  if (fetching && cards === null) {
    return frame(
      <div
        role="status"
        aria-label="Finding what to try next"
        className="flex gap-3 overflow-hidden"
      >
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="aspect-[3/4] w-[148px] shrink-0" />
        ))}
      </div>,
    );
  }

  // Only the owner is told about an empty or failed read; a visitor gets no
  // section at all. A failed read is said as one, not as "nothing to suggest".
  if (error !== undefined && (cards === null || cards.length === 0)) {
    return isOwner
      ? frame(
          <p className="text-ink-3 type-callout">
            Couldn&apos;t load suggestions just now.
          </p>,
        )
      : null;
  }

  if (cards === null || cards.length === 0) {
    return isOwner
      ? frame(
          <p className="text-ink-3 type-callout">
            Nothing to suggest yet. Rank a few in your top two bands, love a
            bottle, or see what friends rank highest.
          </p>,
        )
      : null;
  }

  return frame(
    <ul
      aria-label="Try this next"
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
    >
      {cards.map((card) => (
        <li key={card.key} className="w-[148px] shrink-0 snap-start">
          <TryNextTile card={card} />
        </li>
      ))}
    </ul>,
  );
}

/** One catalog card: the look, the name, why, and the bookmark. */
export function TryNextTile({ card }: { card: TryNextCard }) {
  return (
    <article className="relative flex flex-col gap-2">
      <div className="relative">
        {card.item !== null ? (
          <ItemImage
            url={card.item.imageUrl}
            placeholder={card.item.placeholder}
            fallback={
              <LabelPlate
                type={card.item.type}
                plate={card.item.plate}
                className="rounded-lg"
              />
            }
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-2 text-ink-2">
            <Place aria-hidden strokeWidth={ICON_STROKE} className="size-8" />
          </div>
        )}
        <WantToTryButton
          target={card.target}
          saved={card.saved}
          name={card.name}
          size="sm"
          framed
          className="absolute top-1 right-1 z-10"
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <Link
          href={card.href}
          overlay
          underline="none"
          className="line-clamp-2 font-semibold text-ink-1 type-callout"
        >
          {card.name}
        </Link>
        {card.subtitle !== null && (
          <p className="truncate type-footnote">{card.subtitle}</p>
        )}
        <p className="line-clamp-3 text-ink-2 type-footnote">{card.reason}</p>
      </div>
    </article>
  );
}
