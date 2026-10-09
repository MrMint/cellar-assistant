/**
 * Continue and Drink soon (X10): `me.openBottles` as the cards draw them.
 *
 * Pure — `continue.test.ts`.
 */
import {
  type ApiItemType,
  cellarItemHref,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import type { ResultOf } from "@/lib/api/graphql";
import { type LabelPlateData, labelPlateFrom } from "@/lib/items/label-plate";
import { formatItemVintage } from "@/utilities";
import { displayItemName } from "@/utilities/smart-title-case";
import type { HomeContinueQuery } from "./queries";

type BottleNode = NonNullable<
  ResultOf<typeof HomeContinueQuery>["me"]
>["openBottles"]["edges"][number]["node"];

export type OpenBottle = {
  /** `cellar_items.id`. */
  readonly id: string;
  readonly cellarId: string;
  readonly cellarName: string | null;
  /** The bottle page. */
  readonly href: string;
  readonly itemId: string;
  readonly type: ApiItemType;
  /** "2016 Barolo" for a wine with a year. */
  readonly title: string;
  /** The plain name, for the drink log and its toast. */
  readonly name: string;
  readonly photoUrl: string | null;
  readonly placeholder: string | null;
  readonly plate: LabelPlateData;
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  readonly percentageRemaining: number;
  /** The field the drink-soon table reads (D29), per type. */
  readonly style: string | null;
  readonly form: string | null;
};

const isApiItemType = (value: string): value is ApiItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** One node, or null when the item edge was nulled (no longer visible). */
export const openBottleFromNode = (node: BottleNode): OpenBottle | null => {
  const item = node.item;
  if (item === null || item === undefined || !isApiItemType(item.type)) {
    return null;
  }
  const type = item.type;
  const name = displayItemName(item.name);
  const vintage =
    item.__typename === "Wine"
      ? formatItemVintage("WINE", item.vintage)
      : undefined;
  const style =
    item.__typename === "Wine"
      ? item.wineStyle
      : item.__typename === "Sake"
        ? item.category
        : item.__typename === "Spirit"
          ? item.spiritType
          : item.__typename === "Tea"
            ? item.category
            : null;
  const plate = labelPlateFrom({
    type,
    name: item.name,
    country: item.country,
    ...(item.__typename === "Wine" ||
    item.__typename === "Beer" ||
    item.__typename === "Spirit"
      ? {
          vintage: item.vintage,
          alcoholContentPercentage: item.alcoholContentPercentage,
        }
      : {}),
    ...(item.__typename === "Sake"
      ? {
          vintageYear: item.vintageYear,
          alcoholContentPercentage: item.alcoholContentPercentage,
        }
      : {}),
    ...(item.__typename === "Wine" ||
    item.__typename === "Sake" ||
    item.__typename === "Tea"
      ? { region: item.region }
      : {}),
  });
  return {
    id: node.id,
    cellarId: node.cellarId,
    cellarName: node.cellar?.name ?? null,
    href: cellarItemHref(node.cellarId, type, node.id),
    itemId: item.id,
    type,
    title: vintage === undefined ? name : `${vintage} ${name}`,
    name,
    photoUrl: node.displayImage?.file.url ?? null,
    placeholder: node.displayImage?.placeholder ?? null,
    plate,
    openAt: node.openAt as string | null,
    emptyAt: node.emptyAt as string | null,
    percentageRemaining: node.percentageRemaining,
    style: style ?? null,
    form: item.__typename === "Tea" ? (item.form ?? null) : null,
  };
};

export const openBottlesFromNodes = (
  nodes: readonly BottleNode[],
): OpenBottle[] =>
  nodes.flatMap((node) => {
    const bottle = openBottleFromNode(node);
    return bottle === null ? [] : [bottle];
  });
