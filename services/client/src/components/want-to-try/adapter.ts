/**
 * X08 — "Want to try" (D27's Save verb), as plain data: what a Save names,
 * how it travels, what the toast says, and how a list entry becomes a row.
 * No React here, so the rules are tested as data (`adapter.test.ts`).
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemTypeLabel } from "@/components/cellar-api/itemTypes";
import { itemHref } from "@/components/item-api/itemTypes";
import type { ResultOf } from "@/lib/api/graphql";
import { type Page, toPage } from "@/lib/paging/paged-connection";
import { formatVintage } from "@/utilities";
import { formatCountry, formatPlaceCategory } from "@/utilities/formatters";
import { displayItemName } from "@/utilities/smart-title-case";
import type { WantToTryEntryFragment } from "./queries";
import { WANT_TO_TRY_PAGE_SIZE } from "./queries";

/** What a Save target names — one of the three kinds the API takes. */
export type WantToTryTarget =
  | {
      readonly kind: "ITEM";
      readonly itemType: ApiItemType;
      readonly itemId: string;
    }
  | { readonly kind: "RECIPE"; readonly recipeId: string }
  | { readonly kind: "PLACE"; readonly placeId: string };

export type WantToTryKind = WantToTryTarget["kind"];

/** `setWantToTry(target:)` — exactly one target, as the API insists. */
export const targetInput = (
  target: WantToTryTarget,
):
  | { itemType: ApiItemType; itemId: string }
  | { recipeId: string }
  | { placeId: string } => {
  switch (target.kind) {
    case "ITEM":
      return { itemType: target.itemType, itemId: target.itemId };
    case "RECIPE":
      return { recipeId: target.recipeId };
    case "PLACE":
      return { placeId: target.placeId };
  }
};

/** The API's `key` for a target: `wine:<id>`, `recipe:<id>`, `place:<id>`. */
export const targetKey = (target: WantToTryTarget): string => {
  switch (target.kind) {
    case "ITEM":
      return `${target.itemType.toLowerCase()}:${target.itemId}`;
    case "RECIPE":
      return `recipe:${target.recipeId}`;
    case "PLACE":
      return `place:${target.placeId}`;
  }
};

/**
 * The toast after a change. Names the thing when there is a name, so a row in
 * a long list confirms *which* one moved: "Barolo is on Want to try".
 */
export const wantToTryMessage = (saved: boolean, name?: string): string => {
  const subject = name?.trim() ? name.trim() : null;
  if (saved) {
    return subject === null
      ? "Saved to Want to try"
      : `${subject} is on Want to try`;
  }
  return subject === null
    ? "Removed from Want to try"
    : `${subject} is off Want to try`;
};

/* -------------------------------------------------------------------------- */
/* The list page                                                               */
/* -------------------------------------------------------------------------- */

/** The page's filter: `?kind=items|places|recipes`, or everything. */
export type WantToTryFilter = "all" | "items" | "places" | "recipes";

export const WANT_TO_TRY_FILTERS: readonly {
  value: WantToTryFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "items", label: "Drinks" },
  { value: "places", label: "Places" },
  { value: "recipes", label: "Recipes" },
];

const FILTER_KINDS: Record<WantToTryFilter, WantToTryKind[] | null> = {
  all: null,
  items: ["ITEM"],
  places: ["PLACE"],
  recipes: ["RECIPE"],
};

export const filterFromParam = (
  value: string | string[] | null | undefined,
): WantToTryFilter => {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "items" || one === "places" || one === "recipes" ? one : "all";
};

export const wantToTryVariables = (
  filter: WantToTryFilter,
  after: string | null,
) => ({
  first: WANT_TO_TRY_PAGE_SIZE,
  after,
  kinds: FILTER_KINDS[filter],
});

type Entry = ResultOf<typeof WantToTryEntryFragment>;

/** One list row, in the shape `WantToTryList` draws. */
export type WantToTryRow = {
  readonly key: string;
  readonly target: WantToTryTarget;
  readonly title: string;
  /** "Wine · France", "Cocktail recipe", "Bar · Madison". */
  readonly description: string;
  readonly href: string;
  readonly imageUrl: string | null;
  /** The item's type, for its glyph; `null` for a recipe or a place. */
  readonly itemType: ApiItemType | null;
  readonly savedAt: string;
};

const ITEM_TYPE_SET = new Set<string>([
  "WINE",
  "BEER",
  "SPIRIT",
  "COFFEE",
  "SAKE",
  "TEA",
]);
const isApiItemType = (value: string): value is ApiItemType =>
  ITEM_TYPE_SET.has(value);

const join = (parts: readonly (string | null | undefined)[]): string =>
  parts
    .filter((part): part is string => !!part && part.trim() !== "")
    .join(" · ");

/**
 * An entry → a row, or `null` for one whose target the server nulled (an item
 * or recipe that stopped being readable between the two reads) — skipped, the
 * way the activity feed skips one, rather than drawn as a blank row.
 */
export const wantToTryRowFromEntry = (entry: Entry): WantToTryRow | null => {
  if (entry.kind === "ITEM") {
    const item = entry.item;
    if (item === null || !isApiItemType(item.type)) return null;
    const vintage =
      item.__typename === "Wine"
        ? formatVintage(item.vintage)
        : item.__typename === "Sake"
          ? formatVintage(item.vintageYear)
          : undefined;
    const name = displayItemName(item.name);
    return {
      key: entry.key,
      target: { kind: "ITEM", itemType: item.type, itemId: item.id },
      title: vintage === undefined ? name : `${vintage} ${name}`,
      description: join([
        itemTypeLabel(item.type),
        formatCountry(item.country),
      ]),
      href: itemHref(item.type, item.id),
      imageUrl: item.images.edges[0]?.node.file?.url ?? null,
      itemType: item.type,
      savedAt: entry.savedAt as string,
    };
  }
  if (entry.kind === "RECIPE") {
    const recipe = entry.recipe;
    if (recipe === null) return null;
    return {
      key: entry.key,
      target: { kind: "RECIPE", recipeId: recipe.id },
      title: recipe.name,
      description: recipe.type === "food" ? "Recipe" : "Cocktail recipe",
      href: `/recipes/${recipe.id}`,
      imageUrl: recipe.imageUrl ?? null,
      itemType: null,
      savedAt: entry.savedAt as string,
    };
  }
  const place = entry.place;
  if (place === null) return null;
  return {
    key: entry.key,
    target: { kind: "PLACE", placeId: place.id },
    title: place.displayName ?? place.name,
    description: join([
      formatPlaceCategory(place.primaryCategory) ?? "Place",
      place.locality,
    ]),
    href: `/places/${place.id}`,
    imageUrl: null,
    itemType: null,
    savedAt: entry.savedAt as string,
  };
};

/**
 * One page of `me.wantToTry` → rows, with the entries the server nulled
 * dropped. `totalCount` stays the server's (it counts those too; the gap is
 * the rare row that stopped being readable between two reads).
 */
export const wantToTryPage = (connection: {
  edges: readonly { node: Entry }[];
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  totalCount?: number | null;
}): Page<WantToTryRow> => {
  const page = toPage(connection, (edge) => wantToTryRowFromEntry(edge.node));
  return {
    ...page,
    rows: page.rows.filter((row): row is WantToTryRow => row !== null),
  };
};

/** The empty state's line for each filter (design §3.6: one line, one action). */
export const emptyCopy = (
  filter: WantToTryFilter,
): { title: string; description: string } => {
  switch (filter) {
    case "items":
      return {
        title: "No drinks saved yet.",
        description:
          "Tap the bookmark on any bottle, a friend's activity or a menu to keep it here.",
      };
    case "places":
      return {
        title: "No places saved yet.",
        description:
          "Tap Want to try on a place and it gets a pin of its own on the map.",
      };
    case "recipes":
      return {
        title: "No recipes saved yet.",
        description: "Tap the bookmark on a recipe to make it later.",
      };
    default:
      return {
        title: "Nothing to try yet.",
        description:
          "Save drinks, places and recipes you want to try, and find them here.",
      };
  }
};

/* -------------------------------------------------------------------------- */
/* Map pins                                                                    */
/* -------------------------------------------------------------------------- */

/** The place ids out of one page of `WantToGoPlaces`. */
export const placeIdsFromEntries = (
  edges: readonly { node: { place: { id: string } | null } }[],
): string[] =>
  edges
    .map((edge) => edge.node.place?.id)
    .filter((id): id is string => typeof id === "string");

/* -------------------------------------------------------------------------- */
/* Insights: "Try this next"                                                   */
/* -------------------------------------------------------------------------- */

/** How many catalog matches the insight offers under its suggestion. */
export const TRY_NEXT_SHOWN = 3;

export type TryNextRow = {
  readonly key: string;
  readonly target: Extract<WantToTryTarget, { kind: "ITEM" }>;
  readonly title: string;
  readonly href: string;
  readonly saved: boolean;
};

type TryNextHit = {
  readonly item: {
    readonly __typename: string;
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly isWantToTry: boolean;
    readonly vintage?: unknown;
    readonly vintageYear?: unknown;
  };
};

/**
 * The search's hits → at most {@link TRY_NEXT_SHOWN} rows, in the search's
 * order, skipping what is already on the list (`onList`: board hrefs) and
 * any repeat. Nothing here ranks or invents: an empty answer is shown as
 * empty, not padded.
 */
export const tryNextRows = (
  hits: readonly TryNextHit[],
  onList: ReadonlySet<string>,
): TryNextRow[] => {
  const rows: TryNextRow[] = [];
  const seen = new Set<string>();
  for (const { item } of hits) {
    if (!isApiItemType(item.type)) continue;
    const href = itemHref(item.type, item.id);
    if (onList.has(href) || seen.has(href)) continue;
    seen.add(href);
    const vintage =
      item.__typename === "Wine"
        ? formatVintage(item.vintage as string | null | undefined)
        : item.__typename === "Sake"
          ? formatVintage(item.vintageYear as number | null | undefined)
          : undefined;
    const name = displayItemName(item.name);
    rows.push({
      key: href,
      target: { kind: "ITEM", itemType: item.type, itemId: item.id },
      title: vintage === undefined ? name : `${vintage} ${name}`,
      href,
      saved: item.isWantToTry,
    });
    if (rows.length === TRY_NEXT_SHOWN) break;
  }
  return rows;
};
