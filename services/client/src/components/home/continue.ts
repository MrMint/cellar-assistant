/**
 * Continue and Drink soon (X10): `me.openBottles` as the cards draw them.
 *
 * Pure — `continue.test.ts`.
 */

import { styleLabel } from "@cellar-assistant/contracts/taste";
import type { PlateStyleFields } from "@/components/app/LabelPlate";
import {
  type ApiItemType,
  cellarItemHref,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import type { ResultOf } from "@/lib/api/graphql";
import { type LabelPlateData, labelPlateFrom } from "@/lib/items/label-plate";
import { formatItemVintage } from "@/utilities";
import { displayItemName } from "@/utilities/smart-title-case";
import type { HomeContinueQuery, HomeDrinkSoonQuery } from "./queries";

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
  /** B03: what picks the plate's vessel (a can for an IPA). */
  readonly styleFields: PlateStyleFields;
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  readonly percentageRemaining: number;
  /** The field the drink-soon table reads (D29), per type. */
  readonly style: string | null;
  /** `style` as a person reads it (F-127): `AMARO_A…` is "Amaro", never the enum. */
  readonly styleName: string | null;
  readonly form: string | null;
  /** The owner's own score (`myReview`), or null when not rated yet. */
  readonly rating: number | null;
  /** The primary brand, the tile's maker line. */
  readonly maker: string | null;
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
            : item.__typename === "Beer"
              ? item.beerStyle
              : null;
  const styleFields: PlateStyleFields = {
    style:
      (item.__typename === "Wine"
        ? item.wineStyle
        : item.__typename === "Beer"
          ? item.beerStyle
          : item.__typename === "Spirit"
            ? item.spiritType
            : null) ?? null,
    variety: item.__typename === "Wine" ? (item.variety ?? null) : null,
    form: item.__typename === "Tea" ? (item.form ?? null) : null,
  };
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
    styleFields,
    openAt: node.openAt as string | null,
    emptyAt: node.emptyAt as string | null,
    percentageRemaining: node.percentageRemaining,
    style: style ?? null,
    styleName: style ? styleLabel(style) : null,
    form: item.__typename === "Tea" ? (item.form ?? null) : null,
    rating: item.myReview?.score ?? null,
    maker: makerOf(item.brands?.edges.map((edge) => edge.node) ?? []),
  };
};

/** The primary brand's name, else the first one's. */
const makerOf = (
  links: readonly {
    readonly isPrimary: boolean | null;
    readonly brand: { readonly name: string } | null;
  }[],
): string | null =>
  (links.find((link) => link.isPrimary === true) ?? links[0])?.brand?.name ??
  null;

export const openBottlesFromNodes = (
  nodes: readonly BottleNode[],
): OpenBottle[] =>
  nodes.flatMap((node) => {
    const bottle = openBottleFromNode(node);
    return bottle === null ? [] : [bottle];
  });

type DrinkSoonNode = NonNullable<
  ResultOf<typeof HomeDrinkSoonQuery>["me"]
>["drinkSoon"]["edges"][number]["node"];

/** A sealed bottle whose window closes soon (L02; L18), as its row draws it. */
export type SealedSoon = {
  readonly id: string;
  readonly href: string;
  readonly type: ApiItemType;
  readonly title: string;
  readonly name: string;
  readonly cellarId: string;
  readonly photoUrl: string | null;
  readonly past: boolean;
  /** "Sealed · ended Jun 2026", or "Sealed · your date: drink by …". */
  readonly line: string;
  /** "Typical for IPA", or null for a date the owner set. */
  readonly typical: string | null;
};

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const monthYear = (date: string): string =>
  `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** The server's sealed rows; opened ones are Home's own (drink-soon.ts). */
export const sealedSoonFromNodes = (
  nodes: readonly DrinkSoonNode[],
): SealedSoon[] =>
  nodes.flatMap((node): SealedSoon[] => {
    const item = node.bottle.item;
    const until = node.window?.until as string | null | undefined;
    if (
      node.reason !== "SEALED" ||
      item === null ||
      item === undefined ||
      !isApiItemType(item.type) ||
      until === null ||
      until === undefined
    ) {
      return [];
    }
    const name = displayItemName(item.name);
    const vintage =
      item.__typename === "Wine"
        ? formatItemVintage("WINE", item.vintage)
        : undefined;
    const ends = node.urgency === "PAST" ? "ended" : "ends";
    const own = node.window?.untilSource === "USER";
    const line = own
      ? `Sealed · your date: drink by ${monthYear(until)}`
      : `Sealed · ${ends} ${monthYear(until)}`;
    const typical =
      own || node.typicalFor === null ? null : `Typical for ${node.typicalFor}`;
    return [
      {
        id: node.bottle.id,
        href: cellarItemHref(node.bottle.cellarId, item.type, node.bottle.id),
        cellarId: node.bottle.cellarId,
        type: item.type,
        title: vintage === undefined ? name : `${vintage} ${name}`,
        name,
        photoUrl: node.bottle.displayImage?.file.url ?? null,
        past: node.urgency === "PAST",
        line,
        typical,
      },
    ];
  });

/**
 * What Drink soon's Open sends: the bottle and its cellar, looked up by id in
 * the viewer's own rows (`me.drinkSoon`) — never taken from anywhere else, so
 * a row id that isn't one of theirs opens nothing.
 */
export const openVariables = (
  id: string,
  rows: readonly SealedSoon[],
): { cellarId: string; cellarItemId: string } | null => {
  const row = rows.find((candidate) => candidate.id === id);
  return row === undefined
    ? null
    : { cellarId: row.cellarId, cellarItemId: row.id };
};
