/**
 * Me › Lists › Loved, the recipes half (X18, D9). `/favorites` was items only
 * while D9 made Love the recipe verb too, so a loved recipe had no list to
 * land on; `lovedRecipes` (newest Love first) is that list. The segment is
 * `?kind=recipes`; no `kind` is drinks, so every old link still lands where
 * it did.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";
import { type ApiResult, unwrapResult } from "@/lib/api/result";
import { type Page, toPage } from "@/lib/paging/paged-connection";

/** Rows per page. The API caps any `first` at 100. */
export const LOVED_RECIPES_PAGE_SIZE = 30;

export const LovedRecipesQuery = graphql(
  `
  query LovedRecipes($first: Int!, $after: String) {
    lovedRecipes(first: $first, after: $after) {
      __typename
      ... on RecipeConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            __typename
            id
            name
            type
            imageUrl
            isLoved
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Which half of Loved: `?kind=recipes`, or drinks. */
export type LovedKind = "drinks" | "recipes";

export const LOVED_KINDS: readonly { value: LovedKind; label: string }[] = [
  { value: "drinks", label: "Drinks" },
  { value: "recipes", label: "Recipes" },
];

export const lovedKindFromParam = (
  value: string | string[] | null | undefined,
): LovedKind => {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "recipes" ? "recipes" : "drinks";
};

/** The URL for one half: drinks keep the bare path (and its `?types=`). */
export const lovedHref = (kind: LovedKind): string =>
  kind === "recipes" ? "/favorites?kind=recipes" : "/favorites";

export type LovedRecipeRow = {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly description: string;
  readonly imageUrl: string | null;
  readonly loved: boolean;
};

type Answer = ResultOf<typeof LovedRecipesQuery>["lovedRecipes"];

/** The query's answer → one page of rows, or the refusal it carried. */
export const lovedRecipesPage = (
  answer: Answer | undefined,
): ApiResult<Page<LovedRecipeRow>> => {
  const result = unwrapResult(answer, "RecipeConnection");
  if (!result.ok) return result;
  return {
    ok: true,
    data: toPage(result.data, (edge) => ({
      id: edge.node.id,
      name: edge.node.name,
      href: `/recipes/${edge.node.id}`,
      description: edge.node.type === "food" ? "Recipe" : "Cocktail",
      imageUrl: edge.node.imageUrl ?? null,
      loved: edge.node.isLoved,
    })),
  };
};
