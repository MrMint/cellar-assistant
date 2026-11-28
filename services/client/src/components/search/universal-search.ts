/**
 * Universal search (X12, decisions D9 and D10): one results page of
 * sections — Your bottles · Items · Places · Recipes · People · Brands —
 * three rows each, then "See all".
 *
 * Documents and the pure model: which sections a search has, the rows each
 * one shows, where "See all" goes. The markup is `UniversalSearchResults.tsx`;
 * `universal-search.test.ts` holds the decisions.
 *
 * One document per section, run side by side on the server: each root field
 * answers a typed failure, but a resolver error inside one (a recipe that
 * vanished between the search and its hydration) would null the whole
 * document, and one section's trouble must never blank the other five.
 *
 * The limits are the same whether a section is previewed or opened with
 * "See all", so the search actors' keys — and their cached result sets — are
 * shared: opening a section re-reads nothing the preview did not.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  cellarItemHref,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { itemHref } from "@/components/item-api/itemTypes";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { type FragmentOf, graphql, type ResultOf } from "@/lib/api/graphql";
import { formatPlaceCategory } from "@/utilities/formatters";
import { formatBrandType } from "../brand/brand-type-display";
import { searchResultFromCard } from "./adapter";

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/** D10's order. A section with nothing to show is not drawn. */
export const SEARCH_SECTIONS = [
  "bottles",
  "items",
  "places",
  "recipes",
  "people",
  "brands",
] as const;
export type SearchSection = (typeof SEARCH_SECTIONS)[number];

export const SECTION_LABELS: Readonly<Record<SearchSection, string>> = {
  bottles: "Your bottles",
  items: "Drinks",
  places: "Places",
  recipes: "Recipes",
  people: "People",
  brands: "Brands",
};

/** How many rows a section shows before "See all" (D10). */
export const SECTION_PREVIEW_SIZE = 3;

/**
 * What each section's search holds — also what "See all" shows. `people`
 * is `userSearch`'s cap; the rest are a phone's long scroll.
 */
export const SECTION_LIMITS: Readonly<Record<SearchSection, number>> = {
  bottles: 50,
  items: 20,
  places: 20,
  recipes: 20,
  people: 10,
  brands: 20,
};

/** `?in=<section>`: the one section "See all" opened, or null. */
export const sectionFromParam = (
  value: string | string[] | undefined,
): SearchSection | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return SEARCH_SECTIONS.find((section) => section === raw) ?? null;
};

/**
 * Where a section's "See all" goes: always in place, under the same box
 * (`?in=`), with that section's chip lit, so the search and its focus
 * survive (Recipes-Search 15). Brands too: there is no brand index (L37).
 * An opened Places section offers the map beside it (`mapSearchHref`).
 */
export const seeAllHref = (section: SearchSection, query: string): string =>
  `/search?q=${encodeURIComponent(query)}&in=${section}`;

/** A scope chip or a "Look in" tile: the section, with or without a query. */
export const scopeHref = (section: SearchSection, query: string): string =>
  query === ""
    ? `/search?in=${section}`
    : `/search?q=${encodeURIComponent(query)}&in=${section}`;

/** The opened Places section's way to the map, with the same words. */
export const mapSearchHref = (query: string): string =>
  `/map?search=${encodeURIComponent(query)}`;

/** Back from an opened section to every section. */
export const allResultsHref = (query: string): string =>
  `/search?q=${encodeURIComponent(query)}`;

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export const SearchBottlesQuery = graphql(
  `
  query UniversalSearchBottles($term: String!, $limit: Int!) {
    me {
      __typename
      id
      aiCapabilities {
        semanticSearch
      }
      bottleSearch(term: $term, limit: $limit, first: $limit) {
        totalCount
        edges {
          node {
            cellarItemId
            cellarId
            cellarName
            bottleCount
            item {
              ...ItemCard
            }
          }
        }
      }
    }
  }
`,
  [ItemCardFragment],
);

export const SearchItemsSectionQuery = graphql(
  `
  query UniversalSearchItems($term: String!, $limit: Int!) {
    itemSearch(text: $term, narrow: true, limit: $limit, first: $limit) {
      __typename
      ... on ItemSearchConnection {
        totalCount
        totalIsLowerBound
        edges {
          node {
            __typename
            id
            item {
              ...ItemCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCardFragment, ActorErrorFieldsFragment],
);

export const SearchPlacesSectionQuery = graphql(
  `
  query UniversalSearchPlaces(
    $term: String!
    $limit: Int!
    $bounds: MapBoundsInput
  ) {
    placeSearch(query: $term, bounds: $bounds, limit: $limit, first: $limit) {
      __typename
      ... on PlaceSearchConnection {
        totalCount
        totalIsLowerBound
        edges {
          node {
            id
            name
            primaryCategory
            locality
            region
            rating
            location {
              lat
              lng
            }
            textRank
            trigramSimilarity
            reviewStatus
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SearchRecipesSectionQuery = graphql(
  `
  query UniversalSearchRecipes($term: String!, $limit: Int!) {
    recipeSearch(term: $term, hybrid: true, limit: $limit, first: $limit) {
      __typename
      ... on RecipeSearchConnection {
        totalCount
        totalIsLowerBound
        edges {
          node {
            recipeId
            name
            description
            type
            recipeGroupId
            distance
            recipe {
              id
              imageUrl
              recipeGroup {
                id
                name
              }
              makeability {
                status
                missing
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SearchPeopleSectionQuery = graphql(
  `
  query UniversalSearchPeople($term: String!, $limit: Int!) {
    userSearch(
      term: $term
      includeConnected: true
      limit: $limit
      first: $limit
    ) {
      __typename
      ... on UserSearchConnection {
        totalCount
        totalIsLowerBound
        edges {
          node {
            userId
            displayName
            avatarUrl
            relation
            pendingRequestId
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SearchBrandsSectionQuery = graphql(
  `
  query UniversalSearchBrands($term: String!, $limit: Int!) {
    brandSearch(term: $term, limit: $limit, first: $limit) {
      __typename
      ... on BrandSearchConnection {
        totalCount
        totalIsLowerBound
        edges {
          node {
            id
            brand {
              id
              name
              brandType
              itemCount
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

export type PersonRelation =
  | "FRIEND"
  | "REQUEST_RECEIVED"
  | "REQUEST_SENT"
  | "NONE";

/** What sits at the start of a row. */
export type RowThumb =
  /** A stored photo: a presigned file URL, which `next/image` may load. */
  | { readonly kind: "image"; readonly url: string }
  /**
   * A free-form URL (`Recipe.imageUrl`): drawn as a plain `<img>`, since
   * `next/image` would need its host allowlisted — as `RecipeGroupCard` does.
   */
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "item"; readonly itemType: string }
  | { readonly kind: "icon"; readonly icon: "place" | "recipe" | "brand" }
  | {
      readonly kind: "avatar";
      readonly url: string | null;
      readonly name: string;
    };

/**
 * What a row opens in the desktop quick-look pane (F-42): an item's page
 * body (`ItemPane`), or a place's (`PlacePane`). Absent: no pane, Enter
 * opens the page.
 */
export type SearchLook =
  | {
      readonly kind: "item";
      readonly itemId: string;
      readonly itemType: ApiItemType;
      /** Your bottle's cellar, when the row is one of your bottles. */
      readonly cellarId?: string;
    }
  | { readonly kind: "place"; readonly placeId: string };

export type SearchRow = {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  /** Where the row goes; absent for a person you are not connected to. */
  readonly href?: string;
  readonly thumb: RowThumb;
  /** An item's score: the row's third line of stars. */
  readonly score?: number | null;
  /** A place's public rating, at the right with the people glyph. */
  readonly rating?: number | null;
  /** What the desktop pane shows for this row (F-42). */
  readonly look?: SearchLook;
  /**
   * A person who is not your friend: the row ends in Add friend, Cancel
   * request or Accept, by where things stand (`PersonAction`).
   */
  readonly person?: {
    readonly userId: string;
    readonly name: string;
    readonly relation: Exclude<PersonRelation, "FRIEND">;
    /** The open request between you, for Cancel or Accept (F-43, F-105). */
    readonly requestId: string | null;
  };
};

export type SectionModel = {
  readonly section: SearchSection;
  readonly label: string;
  /** Every row the search held; the preview shows the first three. */
  readonly rows: readonly SearchRow[];
  /** Matches in all, from the API's count; never a fetch limit. */
  readonly total: number;
  /**
   * The total is the section's cap, not its count (MC-search): there are
   * at least that many, so it reads "200+" (CROSS-LOT, totals).
   */
  readonly totalIsLowerBound: boolean;
  /** Words after the count: "in Garage" for bottles, "from you" for places. */
  readonly context?: string;
};

/**
 * A read with no section count (barcode, photo): what it found, "n+" when the
 * read was cut off at its limit or says there is more — a limit is never a
 * total (CROSS-LOT; F-100).
 */
export const fetchedTotalLabel = (found: {
  readonly shown: number;
  readonly limit: number;
  readonly totalCount?: number | null;
  readonly totalIsLowerBound?: boolean;
  readonly hasNextPage?: boolean;
}): string => {
  if (found.totalCount != null && !found.totalIsLowerBound)
    return totalLabel({
      total: Math.max(found.totalCount, found.shown),
      totalIsLowerBound: false,
    });
  const cut =
    found.totalIsLowerBound === true ||
    found.hasNextPage === true ||
    found.shown >= found.limit;
  return totalLabel({
    total: Math.max(found.totalCount ?? 0, found.shown),
    totalIsLowerBound: cut,
  });
};

/** "16", or "200+" when the API says the count is only a lower bound. */
export const totalLabel = (model: {
  readonly total: number;
  readonly totalIsLowerBound: boolean;
}): string => `${model.total}${model.totalIsLowerBound ? "+" : ""}`;

/** "Wine · Cabernet Sauvignon" — the words that are there, in that order. */
const joinLine = (parts: readonly (string | null | undefined)[]) => {
  const line = parts.filter((part) => part != null && part !== "").join(" · ");
  return line === "" ? undefined : line;
};

const counted = (count: number, one: string, many: string) =>
  count <= 0 ? null : `${count} ${count === 1 ? one : many}`;

type ItemCardNode = FragmentOf<typeof ItemCardFragment>;

const itemRowParts = (node: ItemCardNode) => {
  const card = searchResultFromCard(node);
  return {
    card,
    title: card.vintage ? `${card.name} ${card.vintage}` : card.name,
    thumb:
      card.displayImageUrl !== undefined
        ? ({ kind: "image", url: card.displayImageUrl } as const)
        : ({ kind: "item", itemType: card.type } as const),
  };
};

/** A section's read: its rows and the API's count of what matched. */
export type SectionRows = {
  readonly rows: SearchRow[];
  readonly total: number;
  readonly totalIsLowerBound: boolean;
  readonly context?: string;
};

const NO_ROWS: SectionRows = { rows: [], total: 0, totalIsLowerBound: false };

/** The API's count, never below the rows in hand, and never a limit. */
const withTotal = (
  rows: SearchRow[],
  found: { totalCount?: number | null; totalIsLowerBound?: boolean },
): SectionRows => ({
  rows,
  total: Math.max(found.totalCount ?? 0, rows.length),
  totalIsLowerBound:
    found.totalCount == null ? false : (found.totalIsLowerBound ?? false),
});

/** The item behind a row, so Drinks can leave out what Your bottles shows. */
const itemKey = (type: string, itemId: string) => `${type}:${itemId}`;

export const bottleRows = (
  data: ResultOf<typeof SearchBottlesQuery> | undefined,
): SectionRows & { readonly itemKeys: ReadonlySet<string> } => {
  const found = data?.me?.bottleSearch;
  if (found === undefined) return { ...NO_ROWS, itemKeys: new Set() };
  const itemKeys = new Set<string>();
  const cellars = new Set(found.edges.map(({ node }) => node.cellarName));
  const rows = found.edges.map(({ node }): SearchRow => {
    const { card, title, thumb } = itemRowParts(node.item);
    itemKeys.add(itemKey(card.type, card.itemId));
    return {
      key: `${node.cellarId}:${node.cellarItemId}`,
      title,
      // One cellar is named once, in the header ("in Garage"); several are
      // named on each row. Counts name their noun, and one bottle needs none.
      description: joinLine([
        card.subtitle,
        cellars.size > 1 ? node.cellarName : null,
        node.bottleCount > 1 ? `${node.bottleCount} bottles` : null,
      ]),
      href: cellarItemHref(node.cellarId, card.type, node.cellarItemId),
      look: {
        kind: "item",
        itemId: card.itemId,
        itemType: card.type,
        cellarId: node.cellarId,
      },
      thumb,
      score: card.score ?? null,
    };
  });
  const onlyCellar = cellars.size === 1 ? Array.from(cellars)[0] : undefined;
  return {
    rows,
    // Bottles are counted exactly (the cellar is the viewer's own).
    total: Math.max(found.totalCount ?? 0, rows.length),
    totalIsLowerBound: false,
    ...(onlyCellar !== undefined ? { context: `in ${onlyCellar}` } : {}),
    itemKeys,
  };
};

/**
 * Drinks: the catalog's matches, less the ones already in your cellars —
 * they appear once, under Your bottles (Recipes-Search ruling 1). The count
 * loses the ones left out of the rows in hand; past those it is the API's.
 */
export const itemRows = (
  data: ResultOf<typeof SearchItemsSectionQuery> | undefined,
  inCellars: ReadonlySet<string> = new Set(),
): SectionRows => {
  const hits = data?.itemSearch;
  if (hits?.__typename !== "ItemSearchConnection") return NO_ROWS;
  let left = 0;
  const rows = hits.edges.flatMap(({ node }): SearchRow[] => {
    const { card, title, thumb } = itemRowParts(node.item);
    if (inCellars.has(itemKey(card.type, card.itemId))) {
      left += 1;
      return [];
    }
    return [
      {
        key: `${card.type}:${card.itemId}`,
        title,
        description: joinLine([card.subtitle ?? itemTypeLabel(card.type)]),
        href: itemHref(card.type, card.itemId),
        look: { kind: "item", itemId: card.itemId, itemType: card.type },
        thumb,
        score: card.score ?? null,
      },
    ];
  });
  const counted = withTotal(rows, hits);
  return { ...counted, total: Math.max(counted.total - left, rows.length) };
};

/**
 * A place hit that matched by **name** (full text or trigram), not only by
 * the categories the phrase implies. Without the viewer's position a
 * category-only hit is a random bar somewhere in the world; with it, the
 * search is already bounded to around them and every hit is kept.
 */
export const PLACE_NAME_MATCH = 0.3;

/** Within this many metres a place is where you are: "Here". */
export const HERE_METRES = 25;

const NNBSP = " ";

/** Great-circle metres between two points. */
export const metresBetween = (
  a: { readonly latitude: number; readonly longitude: number },
  b: { readonly lat: number; readonly lng: number },
): number => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.latitude) * rad;
  const dLng = (b.lng - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** "Here", "142 m", "1.4 km" — a narrow no-break space before the unit. */
export const distanceLabel = (metres: number): string => {
  if (metres < HERE_METRES) return "Here";
  if (metres < 1000) return `${Math.round(metres)}${NNBSP}m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)}${NNBSP}km`;
};

export const placeRows = (
  data: ResultOf<typeof SearchPlacesSectionQuery> | undefined,
  options: {
    readonly bounded: boolean;
    readonly origin?: {
      readonly latitude: number;
      readonly longitude: number;
    } | null;
  },
): SectionRows => {
  const hits = data?.placeSearch;
  if (hits?.__typename !== "PlaceSearchConnection") return NO_ROWS;
  const origin = options.origin ?? null;
  const rows = hits.edges
    .map(({ node }) => node)
    .filter(
      (node) =>
        options.bounded ||
        node.textRank > 0 ||
        node.trigramSimilarity >= PLACE_NAME_MATCH,
    )
    .map(
      (node): SearchRow => ({
        key: node.id,
        title: node.name,
        description: joinLine([
          formatPlaceCategory(node.primaryCategory),
          origin !== null && node.location != null
            ? distanceLabel(metresBetween(origin, node.location))
            : (node.locality ?? node.region),
          node.reviewStatus === "APPROVED" ? null : "Under review",
        ]),
        href: `/places/${node.id}`,
        look: { kind: "place", placeId: node.id },
        thumb: { kind: "icon", icon: "place" },
        rating: node.rating ?? null,
      }),
    );
  // Name-only filtering drops rows the API counted, so its count would
  // overstate: without a position the count is the rows shown.
  const counted = options.bounded
    ? withTotal(rows, hits)
    : { rows, total: rows.length, totalIsLowerBound: false };
  // CROSS-LOT: name the origin always.
  return origin !== null ? { ...counted, context: "from you" } : counted;
};

const makeabilityLine = (
  makeability:
    | { status: string; missing: readonly string[] }
    | null
    | undefined,
): string | null => {
  if (makeability == null) return null;
  switch (makeability.status) {
    case "MAKE_NOW":
      return "You can make this";
    case "ONE_AWAY":
      return makeability.missing[0] === undefined
        ? "One bottle away"
        : `Missing ${makeability.missing[0]}`;
    default:
      return null;
  }
};

/**
 * Recipes, one row per recipe group (its versions are one drink): the
 * group's name and page when it has one, the recipe's otherwise, and
 * "n versions" when more than one of the group matched (ruling 4). The
 * first hit of a group decides its place — name matches come first (D9).
 */
export const recipeRows = (
  data: ResultOf<typeof SearchRecipesSectionQuery> | undefined,
): SectionRows => {
  const hits = data?.recipeSearch;
  if (hits?.__typename !== "RecipeSearchConnection") return NO_ROWS;
  const versions = new Map<string, number>();
  const firsts: (typeof hits.edges)[number]["node"][] = [];
  for (const { node } of hits.edges) {
    const key =
      node.recipe.recipeGroup?.id ?? node.recipeGroupId ?? node.recipeId;
    const seen = versions.get(key);
    versions.set(key, (seen ?? 0) + 1);
    if (seen === undefined) firsts.push(node);
  }
  const rows = firsts.map((node): SearchRow => {
    const group = node.recipe.recipeGroup;
    const key = group?.id ?? node.recipeGroupId ?? node.recipeId;
    const count = versions.get(key) ?? 1;
    return {
      key,
      title: group?.name ?? node.name,
      description: joinLine([
        node.type === "food" ? "Food" : "Cocktail",
        count > 1 ? `${count} versions` : null,
        makeabilityLine(node.recipe.makeability),
      ]),
      href:
        group !== null && group !== undefined
          ? `/recipes/groups/${group.id}`
          : `/recipes/${node.recipeId}`,
      thumb:
        node.recipe.imageUrl !== null && node.recipe.imageUrl !== ""
          ? { kind: "external", url: node.recipe.imageUrl }
          : { kind: "icon", icon: "recipe" },
    };
  });
  // The API counts recipes; the rows are groups. Fewer rows than hits means
  // the count names versions, so the section counts its groups instead.
  // Groups folded from one page of a longer list are only the groups seen so
  // far: more lie past the page, so the count is a lower bound (F-104).
  const counted = withTotal(rows, hits);
  return rows.length < hits.edges.length
    ? {
        ...counted,
        total: rows.length,
        totalIsLowerBound:
          counted.totalIsLowerBound ||
          (hits.totalCount ?? 0) > hits.edges.length,
      }
    : counted;
};

const RELATION_LINES: Readonly<Record<PersonRelation, string | undefined>> = {
  FRIEND: "Friend",
  REQUEST_RECEIVED: "Wants to be friends",
  REQUEST_SENT: "Request sent",
  NONE: undefined,
};

/**
 * People: a friend opens their profile (`/users/<id>`, X18); anyone else
 * ends in their action — Add friend, Cancel request, or Accept — answered
 * in the row (`PersonAction`). The profile answers friends only.
 */
export const peopleRows = (
  data: ResultOf<typeof SearchPeopleSectionQuery> | undefined,
): SectionRows => {
  const hits = data?.userSearch;
  if (hits?.__typename !== "UserSearchConnection") return NO_ROWS;
  const rows = hits.edges.map(({ node }): SearchRow => {
    const relation: PersonRelation = node.relation ?? "NONE";
    return {
      key: node.userId,
      title: node.displayName,
      description: RELATION_LINES[relation],
      thumb: { kind: "avatar", url: node.avatarUrl, name: node.displayName },
      ...(relation === "FRIEND"
        ? { href: `/users/${encodeURIComponent(node.userId)}` }
        : {
            person: {
              userId: node.userId,
              name: node.displayName,
              relation,
              requestId: node.pendingRequestId ?? null,
            },
          }),
    };
  });
  return withTotal(rows, hits);
};

export const brandRows = (
  data: ResultOf<typeof SearchBrandsSectionQuery> | undefined,
): SectionRows => {
  const hits = data?.brandSearch;
  if (hits?.__typename !== "BrandSearchConnection") return NO_ROWS;
  const rows = hits.edges.map(
    ({ node: { brand } }): SearchRow => ({
      key: brand.id,
      title: brand.name,
      description: joinLine([
        brand.brandType === null ? null : formatBrandType(brand.brandType),
        counted(brand.itemCount, "drink", "drinks"),
      ]),
      href: `/brands/${brand.id}`,
      thumb: { kind: "icon", icon: "brand" },
    }),
  );
  return withTotal(rows, hits);
};

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

export type SectionData = {
  readonly bottles?: ResultOf<typeof SearchBottlesQuery>;
  readonly items?: ResultOf<typeof SearchItemsSectionQuery>;
  readonly places?: ResultOf<typeof SearchPlacesSectionQuery>;
  readonly recipes?: ResultOf<typeof SearchRecipesSectionQuery>;
  readonly people?: ResultOf<typeof SearchPeopleSectionQuery>;
  readonly brands?: ResultOf<typeof SearchBrandsSectionQuery>;
};

/**
 * Every section that has something to show, in D10's order. A section
 * whose search failed or was not asked is simply absent — the others are
 * the answer.
 */
export const buildSections = (
  data: SectionData,
  options: {
    readonly bounded: boolean;
    readonly origin?: {
      readonly latitude: number;
      readonly longitude: number;
    } | null;
  },
): SectionModel[] => {
  const bottles = bottleRows(data.bottles);
  const rows: Record<SearchSection, SectionRows> = {
    bottles,
    items: itemRows(data.items, bottles.itemKeys),
    places: placeRows(data.places, options),
    recipes: recipeRows(data.recipes),
    people: peopleRows(data.people),
    brands: brandRows(data.brands),
  };
  return SEARCH_SECTIONS.flatMap((section): SectionModel[] => {
    const entry = rows[section];
    if (entry.rows.length === 0) return [];
    return [
      {
        section,
        label: SECTION_LABELS[section],
        rows: entry.rows,
        total: entry.total,
        totalIsLowerBound: entry.totalIsLowerBound,
        ...(entry.context === undefined ? {} : { context: entry.context }),
      },
    ];
  });
};
/**
 * Whether a section's search answered at all — found something or found
 * nothing — as opposed to failing: a rejected read (`undefined`), or a root
 * field that answered one of its error types (a spent budget, a refusal)
 * instead of a connection.
 */
export const sectionAnswered = (
  section: SearchSection,
  data: SectionData,
): boolean => {
  switch (section) {
    case "bottles":
      return data.bottles?.me?.bottleSearch !== undefined;
    case "items":
      return data.items?.itemSearch.__typename === "ItemSearchConnection";
    case "places":
      return data.places?.placeSearch.__typename === "PlaceSearchConnection";
    case "recipes":
      return data.recipes?.recipeSearch.__typename === "RecipeSearchConnection";
    case "people":
      return data.people?.userSearch.__typename === "UserSearchConnection";
    case "brands":
      return data.brands?.brandSearch.__typename === "BrandSearchConnection";
  }
};

/**
 * Every section asked for failed: the page cannot say "Nothing called …"
 * — it does not know — so it says the search is not answering instead.
 * One section answering, even with nothing, is enough to be believed.
 */
export const searchUnanswered = (
  asked: readonly SearchSection[],
  data: SectionData,
): boolean =>
  asked.length > 0 && asked.every((section) => !sectionAnswered(section, data));

/**
 * The reads a view makes: every section, or the one See all opened — and,
 * for Drinks, Your bottles too, so the drinks you own stay out of it and the
 * count is the one All showed (ruling 1; F-98).
 */
export const sectionsToRead = (focus: SearchSection | null): SearchSection[] =>
  SEARCH_SECTIONS.filter(
    (section) =>
      focus === null ||
      section === focus ||
      (focus === "items" && section === "bottles"),
  );

/** Whether a previewed section needs "See all": it holds more than it shows. */
export const hasMore = (model: SectionModel): boolean =>
  model.total > SECTION_PREVIEW_SIZE;

/**
 * D25: whether this deployment searches by meaning. `null` when unknown
 * (the bottles read failed) — then nothing is said about it.
 */
export const semanticSearchFrom = (
  data: ResultOf<typeof SearchBottlesQuery> | undefined,
): boolean | null => data?.me?.aiCapabilities.semanticSearch ?? null;

/** The search box's area around a known position: about 30 km each way. */
export const PLACE_SEARCH_RADIUS_DEGREES = 0.3;

export const boundsAround = (location: {
  readonly latitude: number;
  readonly longitude: number;
}) => {
  const lat = PLACE_SEARCH_RADIUS_DEGREES;
  // A degree of longitude shrinks with latitude; keep the box square-ish,
  // and sane near the poles.
  const lng =
    PLACE_SEARCH_RADIUS_DEGREES /
    Math.max(0.2, Math.cos((location.latitude * Math.PI) / 180));
  return {
    west: Math.max(-180, location.longitude - lng),
    east: Math.min(180, location.longitude + lng),
    south: Math.max(-90, location.latitude - lat),
    north: Math.min(90, location.latitude + lat),
  };
};
