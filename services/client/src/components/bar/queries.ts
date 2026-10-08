/**
 * X14's documents: the viewer's bar — What can I make (G29), the Bar pantry
 * (D23), Love on a recipe (D9) and an item's "Cocktails with this".
 *
 * Every one is the viewer's own: none takes a user id, and the API answers
 * from `ctx.viewerId` alone.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";

/** One recipe judged against the viewer's bar. */
export const BarRecipeMatchFragment = graphql(`
  fragment BarRecipeMatchData on BarRecipeMatch @_unmask {
    __typename
    recipeId
    recipeGroupId
    name
    makeability {
      status
      missing
      missingKinds
      substituteCount
      requiredCount
      haveCount
    }
  }
`);

export type BarRecipeMatch = ResultOf<typeof BarRecipeMatchFragment>;

/**
 * Rows per section. The API caps a page at 100; past it the count still says
 * how many there are.
 */
export const BAR_SECTION_LIMIT = 100;

/** `/recipes/bar`: both sections in one read. */
export const WhatCanIMakeQuery = graphql(
  `
  query WhatCanIMake($limit: Int!) {
    whatCanIMake(limit: $limit) {
      __typename
      ... on WhatCanIMake {
        makeNowCount
        oneBottleAwayCount
        bottleCount
        pantryCount
        scanned
        makeNow(first: 100) {
          edges {
            node {
              ...BarRecipeMatchData
            }
          }
        }
        oneBottleAway(first: 100) {
          edges {
            node {
              ...BarRecipeMatchData
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BarRecipeMatchFragment, ActorErrorFieldsFragment],
);

/** `/recipes/bar/pantry`: which toggles are on. */
export const BarPantryQuery = graphql(
  `
  query BarPantry {
    barPantry {
      __typename
      ... on BarPantry {
        have
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SetBarPantryItemMutation = graphql(
  `
  mutation SetBarPantryItem($kind: IngredientKind!, $have: Boolean!) {
    setBarPantryItem(kind: $kind, have: $have) {
      __typename
      ... on BarPantryEntry {
        kind
        have
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * D9. Selects the recipe's own `isLoved` back so the normalised cache
 * (`Recipe` is keyed by id) updates every view of it.
 */
export const ToggleRecipeLoveMutation = graphql(
  `
  mutation ToggleRecipeLove($recipeId: ID!) {
    toggleRecipeLove(recipeId: $recipeId) {
      __typename
      ... on ToggleRecipeLovePayload {
        recipeId
        loved
        recipe {
          __typename
          id
          isLoved
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** An item page's "Cocktails with this" / "Use it up", read on the client. */
export const ItemCocktailsQuery = graphql(
  `
  query ItemCocktails($itemId: ID!, $type: ItemType!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          cocktails {
            kind
            kindLabel
            useItUp
            total
            recipes(first: 20) {
              edges {
                node {
                  ...BarRecipeMatchData
                }
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BarRecipeMatchFragment, ActorErrorFieldsFragment],
);
