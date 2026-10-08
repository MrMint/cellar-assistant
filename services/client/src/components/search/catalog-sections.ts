/**
 * The Recipes and Brands sections of a text search (D1): where recipes and
 * brands are reached from now that neither is a destination in the nav. Three
 * each, then "See all" into the full page with the same term — the shape D10
 * gives every section of the one-page search.
 *
 * Documents and the row shapes here; the markup is `CatalogSections.tsx`.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";
import { formatBrandType } from "../brand/brand-type-display";

/** How many rows each section shows before "See all". */
export const CATALOG_SECTION_SIZE = 3;

export const SearchRecipeGroupsQuery = graphql(
  `
  query SearchRecipeGroups($term: String!, $first: Int!) {
    recipeGroups(first: $first, term: $term, orderBy: NEWEST) {
      __typename
      ... on RecipeGroupConnection {
        totalCount
        edges {
          node {
            id
            name
            category
            baseSpirit
            recipeCount
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SearchBrandsQuery = graphql(
  `
  query SearchBrands($term: String!, $first: Int!) {
    brandSearch(term: $term, limit: $first, first: $first) {
      __typename
      ... on BrandSearchConnection {
        totalCount
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

export type CatalogRow = {
  id: string;
  title: string;
  description: string | undefined;
  href: string;
};

/** "Cocktail · Gin · 3 versions" — the words that are there, in that order. */
const joinLine = (parts: readonly (string | null | undefined)[]) => {
  const line = parts.filter((part) => part != null && part !== "").join(" · ");
  return line === "" ? undefined : line;
};

const capitalise = (word: string) =>
  word.length === 0 ? word : word[0]?.toUpperCase() + word.slice(1);

const plural = (count: number, one: string, many: string) =>
  count === 0 ? null : `${count} ${count === 1 ? one : many}`;

export const recipeRows = (
  data: ResultOf<typeof SearchRecipeGroupsQuery> | undefined,
): CatalogRow[] => {
  const groups = data?.recipeGroups;
  if (groups?.__typename !== "RecipeGroupConnection") return [];
  return groups.edges.map(({ node }) => ({
    id: node.id,
    title: node.name,
    description: joinLine([
      node.category === null ? null : capitalise(node.category),
      node.baseSpirit === null ? null : capitalise(node.baseSpirit),
      plural(node.recipeCount, "version", "versions"),
    ]),
    href: `/recipes/groups/${node.id}`,
  }));
};

export const brandRows = (
  data: ResultOf<typeof SearchBrandsQuery> | undefined,
): CatalogRow[] => {
  const hits = data?.brandSearch;
  if (hits?.__typename !== "BrandSearchConnection") return [];
  return hits.edges.map(({ node: { brand } }) => ({
    id: brand.id,
    title: brand.name,
    description: joinLine([
      brand.brandType === null ? null : formatBrandType(brand.brandType),
      plural(brand.itemCount, "item", "items"),
    ]),
    href: `/brands/${brand.id}`,
  }));
};

/** The full page a section's "See all" opens, with the same term. */
export const seeAllHref = (
  section: "recipes" | "brands",
  term: string,
): string => `/${section}?q=${encodeURIComponent(term)}`;
