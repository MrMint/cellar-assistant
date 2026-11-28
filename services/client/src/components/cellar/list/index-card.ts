import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import type { LabelPlateData } from "@/lib/items/label-plate";
import { canAddToCellar, cellarGroupCell } from "../adapter";
import { CellarCardFragment, type CellarIndexCardFragment } from "../fragments";
import { bottlesLabel, KIND_ORDER } from "./model";

/** One square of a card's mosaic: the bottle's photo, else its plate. */
export type MosaicCell = {
  key: string;
  type: ApiItemType;
  name: string;
  photoUrl: string | null;
  plate: LabelPlateData | null;
};

/** A card of the cellars index (lot-cellars-shelves-01). */
export type IndexCard = {
  id: string;
  name: string;
  /** The viewer may edit it: the creator or a co-owner. */
  mine: boolean;
  /** Whose it is, on a friend's card; null on the viewer's own. */
  owner: { name: string; avatarUrl: string | null } | null;
  bottles: number;
  open: number;
  /** Kinds in the owner's order, none hidden as zero. */
  kinds: { type: ApiItemType; label: string; count: number }[];
  mosaic: MosaicCell[];
};

const COUNT_KEYS = {
  BEER: "beer",
  WINE: "wine",
  SPIRIT: "spirit",
  COFFEE: "coffee",
  TEA: "tea",
  SAKE: "sake",
} as const satisfies Record<ApiItemType, string>;

/** A `CellarIndexCard` node → the card. */
export const indexCardFromNode = (
  data: FragmentOf<typeof CellarIndexCardFragment>,
  viewerId: string,
): IndexCard => {
  // `open` and `recent` are the index's own reads; a node without them (an
  // older cache entry) is a card with no mosaic and nothing open.
  const node = data as unknown as {
    open?: { bottleCount: number } | null;
    recent?: {
      edges: readonly {
        node: Parameters<typeof cellarGroupCell>[0];
      }[];
    } | null;
  };
  const cellar = readFragment(CellarCardFragment, data as never);
  const counts = cellar.itemCounts;
  const mine = canAddToCellar(cellar, viewerId);
  const creator = cellar.createdBy;
  return {
    id: cellar.id,
    name: cellar.name,
    mine,
    owner:
      mine || creator === null || creator === undefined
        ? null
        : { name: creator.displayName, avatarUrl: creator.avatarUrl ?? null },
    bottles: counts?.total ?? 0,
    open: node.open?.bottleCount ?? 0,
    kinds: KIND_ORDER.map((type) => ({
      type,
      label: itemTypeLabel(type),
      count: counts?.[COUNT_KEYS[type]] ?? 0,
    })).filter((kind) => kind.count > 0),
    mosaic: (node.recent?.edges ?? []).map(({ node: group }) => {
      const cell = cellarGroupCell(group);
      return {
        key: cell.item.id,
        type: cell.type,
        name: cell.item.name,
        photoUrl: cell.item.displayImageUrl ?? null,
        plate: cell.item.plate ?? null,
      };
    }),
  };
};

/** "240 bottles · 20 open"; "Empty" for none; no "0 open". */
export const cardCountLine = (card: Pick<IndexCard, "bottles" | "open">) => {
  const bottles = bottlesLabel(card.bottles);
  return card.bottles > 0 && card.open > 0
    ? `${bottles} · ${card.open} open`
    : bottles;
};
