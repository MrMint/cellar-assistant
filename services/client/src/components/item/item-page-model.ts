/**
 * X09 — the one item page, as data: the taste header's three numbers, the
 * fact sheet for all six types, "Your bottles", the producer heading, and
 * which recipes the page lists beside "Cocktails with this".
 *
 * Plain module (no `"use client"`, no React): the server page and the client
 * leaves both import it, and every rule here is a unit test
 * (`item-page-model.test.ts`) rather than a render.
 *
 * Grounded numbers only (design §3.7, the roadmap's "no invented numbers"): every
 * figure on the page is a count or an average of rows somebody wrote. No
 * match percentage, no estimate, and a missing number is said in words.
 */

import { bottleState } from "@/components/cellar/bottle-state";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  formatAsPercentage,
  formatEnum,
  formatItemVintage,
  formatVintage,
} from "@/utilities";
import {
  formatBeerStyle,
  formatCountry,
  formatSpiritType,
  formatWineStyle,
  formatWineVariety,
} from "@/utilities/formatters";
import {
  type Characteristic,
  type ItemAttributesSource,
  type ItemCoreSource,
  itemCharacteristics,
} from "./adapter";
import type { ItemRecipeIngredient } from "./ItemRecipes";

/* -------------------------------------------------------------------------- */
/* The taste header: You · Friends · Everyone                                  */
/* -------------------------------------------------------------------------- */

export type ScoreSummary = {
  readonly average: number | null;
  readonly count: number;
};

export type TasteCell = {
  readonly key: "you" | "friends" | "everyone";
  /** The overline: "You", "Friends", "Everyone". */
  readonly label: string;
  /** The number, or null when there is none to show. */
  readonly value: number | null;
  /** What the number is made of, or why there is none — always words. */
  readonly note: string;
  /** Where a tap goes on the page. */
  readonly href: `#${string}`;
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The three cells, always three and always in this order, so the header
 * never reflows as numbers arrive. "You" is your review's score — the one
 * rating per item (D5), not an average of your logs. "Friends" and
 * "Everyone" are averages with the count beside them, so 5.0 from one
 * person never reads like 4.6 from forty.
 */
export const tasteCells = ({
  mine,
  friends,
  everyone,
}: {
  mine: number | null;
  friends: ScoreSummary;
  everyone: ScoreSummary;
}): readonly TasteCell[] => [
  {
    key: "you",
    label: "You",
    value: mine,
    note: mine === null ? "Rate it" : "Your rating",
    href: "#your-review",
  },
  {
    key: "friends",
    label: "Friends",
    value: friends.count > 0 ? friends.average : null,
    note:
      friends.count > 0
        ? plural(friends.count, "friend", "friends")
        : "No friends' ratings",
    href: "#reviews",
  },
  {
    key: "everyone",
    label: "Everyone",
    value: everyone.count > 0 ? everyone.average : null,
    note:
      everyone.count > 0
        ? plural(everyone.count, "rating", "ratings")
        : "No ratings yet",
    href: "#reviews",
  },
];

/* -------------------------------------------------------------------------- */
/* The fact sheet, for all six types                                           */
/* -------------------------------------------------------------------------- */

export type Fact = { readonly label: string; readonly value: string };

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const facts = (
  rows: readonly { label: string; value: string | number | undefined }[],
): Fact[] =>
  rows.flatMap((row) =>
    row.value === undefined || row.value === ""
      ? []
      : [{ label: row.label, value: String(row.value) }],
  );

const fromCharacteristics = (rows: readonly Characteristic[]): Fact[] =>
  rows.map((row) => ({ label: row.label, value: String(row.value) }));

/**
 * What the item *is*, one labelled row per recorded attribute, for every
 * type — the old page had a card of chips for sake and tea and only a
 * subtitle for the other four. Nothing unrecorded is shown, and nothing is
 * estimated: an empty attribute is simply not a row. Sake and tea keep their
 * restored labels and order (`itemCharacteristics`), with region and country
 * added, since their subtitle was the only place those appeared.
 */
export const itemFacts = (
  type: ApiItemType,
  core: ItemCoreSource,
  attributes: ItemAttributesSource,
): Fact[] => {
  const country = formatCountry(core.country);
  const abv = formatAsPercentage(num(attributes.alcoholContentPercentage));
  switch (type) {
    case "WINE":
      return facts([
        {
          label: "Vintage",
          value: formatItemVintage(
            "WINE",
            attributes.vintage === null ? null : str(attributes.vintage),
          ),
        },
        { label: "Style", value: formatWineStyle(str(attributes.wineStyle)) },
        {
          label: "Variety",
          value: formatWineVariety(str(attributes.variety)),
        },
        { label: "Region", value: str(attributes.region) },
        { label: "Country", value: country },
        {
          label: "Designation",
          value: formatEnum(str(attributes.specialDesignation)),
        },
        { label: "Vineyard", value: str(attributes.vineyardDesignation) },
        { label: "ABV", value: abv },
      ]);
    case "BEER":
      return facts([
        { label: "Style", value: formatBeerStyle(str(attributes.beerStyle)) },
        { label: "Vintage", value: formatVintage(str(attributes.vintage)) },
        { label: "ABV", value: abv },
        { label: "IBU", value: num(attributes.internationalBitternessUnit) },
        { label: "Country", value: country },
      ]);
    case "SPIRIT":
      return facts([
        { label: "Type", value: formatSpiritType(str(attributes.spiritType)) },
        { label: "Style", value: str(attributes.spiritStyle) },
        { label: "Vintage", value: formatVintage(str(attributes.vintage)) },
        { label: "ABV", value: abv },
        { label: "Country", value: country },
      ]);
    case "COFFEE":
      return facts([
        { label: "Roast", value: formatEnum(str(attributes.roastLevel)) },
        { label: "Species", value: formatEnum(str(attributes.species)) },
        { label: "Cultivar", value: formatEnum(str(attributes.cultivar)) },
        { label: "Process", value: formatEnum(str(attributes.process)) },
        { label: "Country", value: country },
      ]);
    case "SAKE":
      return [
        ...fromCharacteristics(itemCharacteristics("SAKE", attributes)),
        ...facts([
          { label: "Amino Acid", value: num(attributes.aminoAcid) },
          { label: "Region", value: str(attributes.region) },
          { label: "Country", value: country },
        ]),
      ];
    case "TEA":
      return [
        ...fromCharacteristics(itemCharacteristics("TEA", attributes)),
        ...facts([
          { label: "Region", value: str(attributes.region) },
          { label: "Country", value: country },
        ]),
      ];
  }
};

/* -------------------------------------------------------------------------- */
/* One producer heading per type                                               */
/* -------------------------------------------------------------------------- */

/**
 * Who makes it, in the word each type's world uses — the same word on the
 * item page and the bottle page (they used to disagree: "Wine Brands" on
 * one, "Wineries" on the other). The words follow the brand types the
 * catalog infers (`PRODUCER_OF` in `brand/adapter.ts`), in plain English
 * for sake's kura.
 */
export const PRODUCER_TITLE = {
  WINE: { one: "Winery", many: "Wineries" },
  BEER: { one: "Brewery", many: "Breweries" },
  SPIRIT: { one: "Distillery", many: "Distilleries" },
  COFFEE: { one: "Roaster", many: "Roasters" },
  SAKE: { one: "Brewery", many: "Breweries" },
  TEA: { one: "Tea house", many: "Tea houses" },
} as const satisfies Record<ApiItemType, { one: string; many: string }>;

/** The producer section's heading for `count` linked brands. */
export const producerTitle = (type: ApiItemType, count: number): string =>
  count > 1 ? PRODUCER_TITLE[type].many : PRODUCER_TITLE[type].one;

/* -------------------------------------------------------------------------- */
/* Your bottles                                                                */
/* -------------------------------------------------------------------------- */

/** One of the viewer's bottles of this item (`Item.myBottles`). */
export type YourBottle = {
  readonly id: string;
  readonly cellarId: string;
  /** Null when the cellar could not be read back (it is still yours). */
  readonly cellarName: string | null;
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  readonly percentageRemaining: number;
};

/**
 * The row's state line: "Open · 60% left", "Sealed", "Finished" — the
 * BottleCard's rules (`cellar/bottle-state.ts`: finished wins; a level below
 * full counts as open even without `openAt`), with the level spelled out
 * since the row has no bar of its own. No dates, so the server and the
 * browser print the same words.
 */
export const bottleStateLine = (bottle: {
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  readonly percentageRemaining: number;
}): string => {
  const state = bottleState(bottle, null);
  return state.kind === "open"
    ? `Open · ${Math.round(state.level)}% left`
    : state.label;
};

/** "Your bottles" heading count: "2 bottles" — bottles, not cellars (D13). */
export const bottlesCountLabel = (count: number): string | null =>
  count === 0 ? null : plural(count, "bottle", "bottles");

/**
 * The bottle a drink is logged from by default: the selected bottle when it
 * is yours and still in the cellar, else your one open bottle, else none —
 * two open bottles is a question, not a guess.
 */
export const defaultLogBottle = (
  bottles: readonly YourBottle[],
  selectedId: string | null,
): YourBottle | null => {
  const selected =
    selectedId === null
      ? undefined
      : bottles.find((bottle) => bottle.id === selectedId);
  if (selected !== undefined) {
    return selected.emptyAt === null ? selected : null;
  }
  const open = bottles.filter(
    (bottle) => bottleState(bottle, null).kind === "open",
  );
  return open.length === 1 ? (open[0] ?? null) : null;
};

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * "Cocktails with this" (X14) already lists every cocktail that uses the
 * item or its kind, judged against the viewer's bar, on all six types — so
 * the restored "Used in Recipes" keeps only what that section cannot show:
 * the **food** recipes that cook with this exact item. Spirits get them too
 * now; the old page fetched and dropped them for beer, spirit and coffee.
 */
export const cookingRecipes = (
  recipes: readonly ItemRecipeIngredient[],
): ItemRecipeIngredient[] =>
  recipes.filter((ingredient) => ingredient.recipe.type === "food");
