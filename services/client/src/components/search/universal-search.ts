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
  items: "Items",
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
 * Where a section's "See all" goes. Places open on the map, where a list of
 * places belongs, and brands on `/brands` (the same `brandSearch`, with its
 * index around it); every other section opens in place, under the same box
 * (`?in=`), so the search and its focus survive.
 */
export const seeAllHref = (section: SearchSection, query: string): string => {
  const q = encodeURIComponent(query);
  switch (section) {
    case "places":
      return `/map?search=${q}`;
    case "brands":
      return `/brands?q=${q}`;
    default:
      return `/search?q=${q}&in=${section}`;
  }
};

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
        edges {
          node {
            id
            name
            primaryCategory
            locality
            region
            rating
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
        edges {
          node {
            userId
            displayName
            avatarUrl
            relation
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

export type SearchRow = {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  /** Where the row goes; absent for a person you are not connected to. */
  readonly href?: string;
  readonly thumb: RowThumb;
  /** An item's average score, trailing. */
  readonly score?: number | null;
  /** A person you could ask: the row ends in "Add". */
  readonly addFriend?: { readonly userId: string; readonly name: string };
};

export type SectionModel = {
  readonly section: SearchSection;
  readonly label: string;
  /** Every row the search held; the preview shows the first three. */
  readonly rows: readonly SearchRow[];
  /** Matches in all — more than `rows` only for bottles, past the limit. */
  readonly total: number;
};

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

export const bottleRows = (
  data: ResultOf<typeof SearchBottlesQuery> | undefined,
): { rows: SearchRow[]; total: number } => {
  const found = data?.me?.bottleSearch;
  if (found === undefined) return { rows: [], total: 0 };
  const rows = found.edges.map(({ node }): SearchRow => {
    const { card, title, thumb } = itemRowParts(node.item);
    return {
      key: `${node.cellarId}:${node.cellarItemId}`,
      title,
      // Counts name their noun, and a single bottle needs no count.
      description: joinLine([
        node.cellarName,
        node.bottleCount > 1 ? `${node.bottleCount} bottles` : null,
      ]),
      href: cellarItemHref(node.cellarId, card.type, node.cellarItemId),
      thumb,
    };
  });
  return { rows, total: Math.max(found.totalCount ?? 0, rows.length) };
};

export const itemRows = (
  data: ResultOf<typeof SearchItemsSectionQuery> | undefined,
): SearchRow[] => {
  const hits = data?.itemSearch;
  if (hits?.__typename !== "ItemSearchConnection") return [];
  return hits.edges.map(({ node }): SearchRow => {
    const { card, title, thumb } = itemRowParts(node.item);
    return {
      key: `${card.type}:${card.itemId}`,
      title,
      description: joinLine([itemTypeLabel(card.type), card.subtitle]),
      href: itemHref(card.type, card.itemId),
      thumb,
      score: card.score ?? null,
    };
  });
};

/**
 * A place hit that matched by **name** (full text or trigram), not only by
 * the categories the phrase implies. Without the viewer's position a
 * category-only hit is a random bar somewhere in the world; with it, the
 * search is already bounded to around them and every hit is kept.
 */
export const PLACE_NAME_MATCH = 0.3;

export const placeRows = (
  data: ResultOf<typeof SearchPlacesSectionQuery> | undefined,
  options: { readonly bounded: boolean },
): SearchRow[] => {
  const hits = data?.placeSearch;
  if (hits?.__typename !== "PlaceSearchConnection") return [];
  return hits.edges
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
          node.locality ?? node.region,
          node.reviewStatus === "APPROVED" ? null : "Under review",
        ]),
        href: `/places/${node.id}`,
        thumb: { kind: "icon", icon: "place" },
      }),
    );
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
 * group's name and page when it has one, the recipe's otherwise. The first
 * hit of a group decides its place — name matches come first (D9).
 */
export const recipeRows = (
  data: ResultOf<typeof SearchRecipesSectionQuery> | undefined,
): SearchRow[] => {
  const hits = data?.recipeSearch;
  if (hits?.__typename !== "RecipeSearchConnection") return [];
  const seen = new Set<string>();
  const rows: SearchRow[] = [];
  for (const { node } of hits.edges) {
    const group = node.recipe.recipeGroup;
    const key = group?.id ?? node.recipeGroupId ?? node.recipeId;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      title: group?.name ?? node.name,
      description: joinLine([
        node.type === "food" ? "Food" : "Cocktail",
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
    });
  }
  return rows;
};

const RELATION_LINES: Readonly<Record<PersonRelation, string | undefined>> = {
  FRIEND: "Friend",
  REQUEST_RECEIVED: "Wants to be friends",
  REQUEST_SENT: "Request sent",
  NONE: undefined,
};

/**
 * People: friends and open requests go to `/friends`, where they are
 * answered and managed (there is no profile page); anyone else ends in
 * "Add".
 */
export const peopleRows = (
  data: ResultOf<typeof SearchPeopleSectionQuery> | undefined,
): SearchRow[] => {
  const hits = data?.userSearch;
  if (hits?.__typename !== "UserSearchConnection") return [];
  return hits.edges.map(({ node }): SearchRow => {
    const relation: PersonRelation = node.relation ?? "NONE";
    return {
      key: node.userId,
      title: node.displayName,
      description: RELATION_LINES[relation],
      thumb: { kind: "avatar", url: node.avatarUrl, name: node.displayName },
      ...(relation === "NONE"
        ? { addFriend: { userId: node.userId, name: node.displayName } }
        : { href: "/friends" }),
    };
  });
};

export const brandRows = (
  data: ResultOf<typeof SearchBrandsSectionQuery> | undefined,
): SearchRow[] => {
  const hits = data?.brandSearch;
  if (hits?.__typename !== "BrandSearchConnection") return [];
  return hits.edges.map(
    ({ node: { brand } }): SearchRow => ({
      key: brand.id,
      title: brand.name,
      description: joinLine([
        brand.brandType === null ? null : formatBrandType(brand.brandType),
        counted(brand.itemCount, "item", "items"),
      ]),
      href: `/brands/${brand.id}`,
      thumb: { kind: "icon", icon: "brand" },
    }),
  );
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
  options: { readonly bounded: boolean },
): SectionModel[] => {
  const bottles = bottleRows(data.bottles);
  const rows: Record<SearchSection, { rows: SearchRow[]; total?: number }> = {
    bottles,
    items: { rows: itemRows(data.items) },
    places: { rows: placeRows(data.places, options) },
    recipes: { rows: recipeRows(data.recipes) },
    people: { rows: peopleRows(data.people) },
    brands: { rows: brandRows(data.brands) },
  };
  return SEARCH_SECTIONS.flatMap((section) => {
    const entry = rows[section];
    if (entry.rows.length === 0) return [];
    return [
      {
        section,
        label: SECTION_LABELS[section],
        rows: entry.rows,
        total: Math.max(entry.total ?? 0, entry.rows.length),
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
