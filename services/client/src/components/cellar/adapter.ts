/**
 * New API shapes → the old cellar components' props.
 *
 * `82450ad1:src/components/cellar/Cellars.tsx` built `CellarCardClient`'s
 * `cellar` prop inline from the Hasura row; this is that mapping, lifted out so
 * it is unit-tested, over `Cellar.createdBy`/`coOwners` (G4) and
 * `Cellar.itemCounts` (G1).
 *
 * Input types are structural, so a test (or another fragment) can feed them
 * without a GraphQL round trip.
 */

import {
  type ApiItemType,
  cellarItemHref,
} from "@/components/cellar-api/itemTypes";
import {
  type ItemCardSource,
  itemCardFromCellarItem,
} from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import type { BottleFields } from "./bottle-state";
import type { CellarCardProps } from "./CellarCard";
import type { DiaryLog } from "./diary";
import {
  CellarBottleCardFragment,
  CellarCardFragment,
  CellarDiaryEntryFragment,
  CellarItemGroupCardFragment,
} from "./fragments";

export type CellarCardCellar = CellarCardProps["cellar"];
export type CellarCardUser = CellarCardCellar["createdBy"];
export type CellarCardItemCounts = CellarCardCellar["itemCounts"];

type Profile = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

/**
 * A `UserProfile` → the old `User`. The old type had a non-null `avatarUrl`
 * (Nhost always set one); `UserAvatar` treats `""` as "no picture" and shows
 * the initial, which is what a missing avatar now means.
 */
export const userFromProfile = (profile: Profile): CellarCardUser => ({
  id: profile.id,
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl ?? "",
});

export type ItemCountsSource = {
  beer?: number | null;
  wine?: number | null;
  spirit?: number | null;
  coffee?: number | null;
  sake?: number | null;
  tea?: number | null;
} | null;

/**
 * `ItemTypeCounts` (singular keys) → the card's plural ones. A missing count
 * is `0`, exactly as `Cellars.tsx` did (`?.count ?? 0`): the card always shows
 * six numbers, dimming the zeros.
 */
export const cellarCardItemCounts = (
  counts: ItemCountsSource | undefined,
): CellarCardItemCounts => ({
  wines: counts?.wine ?? 0,
  beers: counts?.beer ?? 0,
  spirits: counts?.spirit ?? 0,
  coffees: counts?.coffee ?? 0,
  sakes: counts?.sake ?? 0,
  teas: counts?.tea ?? 0,
});

export type CellarCardSource = {
  id: string;
  name: string;
  createdById: string;
  createdBy?: Profile | null;
  coOwners?: { edges: readonly { node: Profile }[] } | null;
  itemCounts?: ItemCountsSource;
};

/**
 * A cellar → `CellarCardClient`'s `cellar`. `createdBy` is null only for an
 * anonymous viewer, which the authenticated layout rules out; the fallback
 * keeps the creator's id (so `canEdit` still answers right) with no name.
 */
export const cellarCardFromSource = (
  source: CellarCardSource,
): CellarCardCellar => ({
  id: source.id,
  name: source.name,
  createdBy:
    source.createdBy === null || source.createdBy === undefined
      ? { id: source.createdById, displayName: "", avatarUrl: "" }
      : userFromProfile(source.createdBy),
  coOwners: (source.coOwners?.edges ?? []).map((edge) =>
    userFromProfile(edge.node),
  ),
  itemCounts: cellarCardItemCounts(source.itemCounts),
});

export const cellarCardFromFragment = (
  data: FragmentOf<typeof CellarCardFragment>,
): CellarCardCellar =>
  cellarCardFromSource(readFragment(CellarCardFragment, data));

/** The old items page's `canAdd`: the creator or a co-owner. */
export const canAddToCellar = (
  cellar: { createdById: string; coOwnerIds: readonly string[] },
  userId: string | null,
): boolean =>
  userId !== null &&
  (cellar.createdById === userId || cellar.coOwnerIds.includes(userId));

/**
 * One grid cell: the old `TransformedCellarItem`, less the client sort key,
 * plus the bottle's own state for the BottleCard (N13b).
 */
export type CellarGridItem = {
  type: ApiItemType;
  item: ItemCardItem;
  bottle: Required<BottleFields> & {
    /** When it went into the cellar — "Recently added". */
    createdAt?: string | null;
  };
  /**
   * X04's ×N: how many identical bottles this cell stands for (the lead is
   * `item.id`), how many of them are open, and how a search found it.
   * Absent on a list that does not group.
   */
  group?: {
    count: number;
    openCount: number;
    match: "NAME" | "MEANING" | null;
  };
};

export type CellarGridSource = {
  id: string;
  createdAt?: string | null;
  item: ItemCardSource;
  openAt?: string | null;
  emptyAt?: string | null;
  percentageRemaining?: number | null;
  /** The bottle's chosen photo (G15), which beats the item's first image. */
  displayImage?: {
    placeholder?: string | null;
    file?: { url: string } | null;
  } | null;
};

/**
 * A bottle (structural) → a grid cell. `item.id` is the **bottle's** id and
 * `item.itemId` the catalog item's, as `transformCellarItems` set them
 * (decision 1). A bottle with its own photo shows that one.
 */
export const cellarGridItemFromSource = (
  node: CellarGridSource,
): CellarGridItem => {
  const item = itemCardFromCellarItem(node);
  const photo = node.displayImage?.file?.url;
  return {
    type: node.item.type,
    item:
      photo === undefined
        ? item
        : {
            ...item,
            displayImageUrl: photo,
            placeholder: node.displayImage?.placeholder ?? null,
          },
    bottle: {
      openAt: node.openAt ?? null,
      emptyAt: node.emptyAt ?? null,
      percentageRemaining: node.percentageRemaining ?? 100,
      createdAt: node.createdAt ?? null,
    },
  };
};

export type CellarGroupSource = {
  count: number;
  openCount: number;
  match?: "NAME" | "MEANING" | null;
  lead: CellarGridSource;
};

/** A `CellarItemGroup` (structural) → a grid cell with its ×N (X04). */
export const cellarGroupCellFromSource = (
  group: CellarGroupSource,
): CellarGridItem => ({
  ...cellarGridItemFromSource(group.lead),
  group: {
    count: group.count,
    openCount: group.openCount,
    match: group.match ?? null,
  },
});

/** A `Cellar.itemGroups` node (`...CellarItemGroupCard`) → a grid cell. */
export const cellarGroupCell = (
  data: FragmentOf<typeof CellarItemGroupCardFragment>,
): CellarGridItem => {
  const group = readFragment(CellarItemGroupCardFragment, data);
  const lead = readFragment(CellarBottleCardFragment, group.lead);
  return cellarGroupCellFromSource({
    ...group,
    lead: { ...lead, item: readFragment(ItemCardFragment, lead.item) },
  });
};

export const cellarGridItem = (
  data: FragmentOf<typeof CellarBottleCardFragment>,
): CellarGridItem => {
  const node = readFragment(CellarBottleCardFragment, data);
  return cellarGridItemFromSource({
    ...node,
    item: readFragment(ItemCardFragment, node.item),
  });
};

/** One Finished-diary entry (X04): the bottle's cell, and your log from it. */
export type DiaryEntry = {
  cell: CellarGridItem;
  log: DiaryLog | null;
};

/** A `CellarDiaryEntry` node → a diary entry. */
export const diaryEntry = (
  data: FragmentOf<typeof CellarDiaryEntryFragment>,
): DiaryEntry => {
  const group = readFragment(CellarDiaryEntryFragment, data);
  const lead = readFragment(CellarBottleCardFragment, group.lead);
  return {
    cell: cellarGridItemFromSource({
      ...lead,
      item: readFragment(ItemCardFragment, lead.item),
    }),
    log: group.lead.myLog ?? null,
  };
};

/**
 * Where a bottle's card goes: the **bottle** page, by `cellar_items.id`
 * (`cell.item.id`), as in production (decision 1). The bottle page also
 * redirects a catalog item id to the cellar's one bottle of it, so links
 * minted while this sent the item id keep working.
 */
export const cellarBottleHref = (
  cellarId: string,
  cell: CellarGridItem,
): string => cellarItemHref(cellarId, cell.type, cell.item.id);

/**
 * The edit form's co-owner options — `EditCellarClient`'s old rule, plus one
 * case it lost.
 *
 * Old: the viewer's friends, then the viewer, minus the creator (a creator is
 * not their own co-owner; a co-owner editing sees themselves and can step
 * down). Added: any current co-owner who is not among those (no longer a
 * friend, or a friend of the creator's only). Under the old form such a
 * co-owner had no option, so the multi-select silently dropped them on save —
 * a permission change nobody asked for.
 */
export const editCoOwnerOptions = ({
  friends,
  viewer,
  createdById,
  coOwners,
}: {
  friends: readonly Profile[];
  viewer: Profile | null;
  createdById: string;
  coOwners: readonly Profile[];
}): CellarCardUser[] => {
  const options: CellarCardUser[] = [];
  const seen = new Set<string>();
  for (const profile of [
    ...friends,
    ...(viewer === null ? [] : [viewer]),
    ...coOwners,
  ]) {
    if (profile.id === createdById || seen.has(profile.id)) continue;
    seen.add(profile.id);
    options.push(userFromProfile(profile));
  }
  return options;
};
