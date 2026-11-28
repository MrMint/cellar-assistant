import { barKindLabel } from "@cellar-assistant/contracts/bar";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * The spirit chips' counts (F-114, H-87): the kinds the recipe groups hold
 * under the same category and term, each with how many. `first` is the
 * whole vocabulary's worth, well under the API's 100.
 */
export const RECIPE_SPIRIT_COUNTS_SIZE = 50;

export const RecipeBaseSpiritCountsQuery = graphql(
  `
  query RecipeBaseSpiritCounts(
    $first: Int!
    $category: RecipeCategory
    $term: String
  ) {
    recipeBaseSpiritCounts(first: $first, category: $category, term: $term) {
      __typename
      ... on RecipeBaseSpiritCountConnection {
        edges {
          node {
            baseSpirit
            count
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export type SpiritChip = {
  readonly value: string;
  readonly label: string;
  readonly count: number;
};

type CountEdge = {
  readonly node: { readonly baseSpirit: string; readonly count: number };
};

/**
 * One chip per kind present, in the server's order, with its count. The
 * chip you picked stays (at its count, or none) so it can be turned off.
 */
export const spiritChips = (
  edges: readonly CountEdge[],
  selected: string | null,
): SpiritChip[] => {
  const chips = edges
    .filter(({ node }) => node.count > 0)
    .map(({ node }) => ({
      value: node.baseSpirit,
      label: barKindLabel(node.baseSpirit) ?? node.baseSpirit,
      count: node.count,
    }));
  if (selected !== null && !chips.some((chip) => chip.value === selected)) {
    chips.push({
      value: selected,
      label: barKindLabel(selected) ?? selected,
      count: 0,
    });
  }
  return chips;
};
