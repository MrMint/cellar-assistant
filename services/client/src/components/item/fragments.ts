/**
 * The restored item pages' documents — the new-schema successor of the six
 * per-type `82450ad1:src/components/{wine,beer,…}/fragments.ts` files.
 *
 * Old Hasura selection → new field:
 *
 * - `{t}s_by_pk` core + per-type columns → `item(id:, type:)` with
 *   `...ItemCore` / `...ItemAttributes` (sake's and tea's extra columns are
 *   G12/G13).
 * - `item_images(limit: 1)` (no order, so nondeterministic) →
 *   `images(first: 1)`, the actor's own order.
 * - `item_favorites(where: user = me) { id }` → `Item.isFavorite`.
 * - `reviews { user { displayName avatarUrl } }` → `Item.reviews` with
 *   `ItemReview.user` (G4), plus `Item.myReview` (G7) so the review form knows
 *   it is editing rather than adding (one review per viewer).
 * - `cellar_items(where: empty_at null) { cellar { createdBy co_owners } }` →
 *   `Item.cellars` (G9), already reduced to non-empty bottles in cellars the
 *   viewer may see, with `Cellar.createdBy` / `coOwners` (G4).
 * - the server-side `tier_list_items` query in `ItemTierLists` →
 *   `Item.tierListEntries` (G8), reduced by `canSeeTierList`: the old query
 *   leaked private list names.
 * - `recipe_ingredients { recipe { … } }` (wine, sake, tea) →
 *   `Item.recipeIngredients` + `RecipeIngredient.recipe` (G11).
 * - `cellar_items_by_pk(id)` → `Cellar.item(id)` (G10): the URL's id is the
 *   bottle again (decision 1). Its `check_ins { user }` → `CellarItem.checkIns`
 *   (G14) with `CheckIn.user` (G4); `display_image { file_id placeholder }` →
 *   `CellarItem.displayImage` (G15).
 * - `user(id).friends { friend }` → `myFriends`.
 *
 * Every page size is a literal, not a variable: the API prices a nested page
 * as the product of the `first`s, and a variable is priced at its 100 maximum
 * (`services/api/src/limits.ts`, `MAX_QUERY_ROWS`).
 */

import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import {
  ItemAttributesFragment,
  ItemBrandFragment,
  ItemCoreFragment,
} from "@/lib/api/items";

/** How many reviews a page paints before "Show more reviews". */
export const ITEM_PAGE_REVIEWS = 20;

/** One review as the old `ItemReviews` row needs it: score, text, author. */
export const ItemPageReviewFragment = graphql(`
  fragment ItemPageReview on ItemReview {
    __typename
    id
    score
    text
    createdAt
    userId
    user {
      __typename
      id
      displayName
      avatarUrl
    }
  }
`);

/** What both the item page and the bottle page show of the catalog item. */
export const ItemPageItemFragment = graphql(
  `
  fragment ItemPageItem on Item {
    __typename
    ...ItemCore
    ...ItemAttributes
    isFavorite
    images(first: 1) {
      edges {
        node {
          __typename
          id
          placeholder
          file {
            __typename
            id
            url
          }
        }
      }
    }
    brands(first: 10) {
      edges {
        node {
          ...ItemBrandRow
        }
      }
    }
    myReview {
      __typename
      id
      score
      text
    }
    reviews(first: 20) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ItemPageReview
        }
      }
    }
  }
`,
  [
    ItemCoreFragment,
    ItemAttributesFragment,
    ItemBrandFragment,
    ItemPageReviewFragment,
  ],
);

/**
 * What only the item page shows: "Located in:" and "On Lists". The bottle
 * page never had them.
 */
export const ItemPageRelationsFragment = graphql(`
  fragment ItemPageRelations on Item {
    __typename
    cellars(first: 20) {
      edges {
        node {
          __typename
          id
          name
          createdById
          createdBy {
            __typename
            id
            displayName
            avatarUrl
          }
          coOwners(first: 10) {
            edges {
              node {
                __typename
                id
                displayName
                avatarUrl
              }
            }
          }
        }
      }
    }
    tierListEntries(first: 20) {
      edges {
        node {
          __typename
          id
          band
          tierList {
            __typename
            id
            name
          }
        }
      }
    }
  }
`);

/**
 * "Used in Recipes" (G11). The old wine, sake and tea fragments selected it;
 * beer, spirit and coffee fetched it too and never rendered it, so the view
 * config decides where it shows.
 */
export const ItemPageRecipesFragment = graphql(`
  fragment ItemPageRecipes on Item {
    __typename
    recipeIngredients(first: 20) {
      edges {
        node {
          __typename
          id
          quantity
          unit
          isOptional
          recipe {
            __typename
            id
            name
            type
            imageUrl
            difficultyLevel
          }
        }
      }
    }
  }
`);

/**
 * `/{type}s/[itemId]` — the item, its relations, the viewer, and the cellars
 * the viewer can drop a bottle into (the old page's `cellars` prop: own and,
 * now, co-owned — `myCellars` is `canSeeCellar`, so the adapter filters).
 */
export const ItemPageQuery = graphql(
  `
  query ItemPage($itemId: ID!, $type: ItemType!) {
    me {
      id
    }
    myCellars(first: 100) {
      __typename
      ... on CellarConnection {
        edges {
          node {
            __typename
            id
            name
            createdById
            coOwnerIds
          }
        }
      }
      ...ActorErrorFields
    }
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          ...ItemPageItem
          ...ItemPageRelations
          ...ItemPageRecipes
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [
    ItemPageItemFragment,
    ItemPageRelationsFragment,
    ItemPageRecipesFragment,
    ActorErrorFieldsFragment,
  ],
);

/** "Show more reviews" — the next page of `Item.reviews`, from the client. */
export const ItemReviewsPageQuery = graphql(
  `
  query ItemReviewsPage($itemId: ID!, $type: ItemType!, $after: String!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          reviews(first: 20, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                ...ItemPageReview
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemPageReviewFragment, ActorErrorFieldsFragment],
);

/**
 * `/cellars/[cellarId]/{type}s/[bottleId]` — one bottle (G10) with its
 * check-ins (G14) and display photo (G15), the item it holds, the viewer and
 * their friends (the bulk check-in picker).
 */
export const CellarItemPageQuery = graphql(
  `
  query CellarItemPage($cellarId: ID!, $bottleId: ID!) {
    me {
      id
      profile {
        id
        displayName
        avatarUrl
      }
    }
    myFriends(first: 100) {
      __typename
      ... on FriendConnection {
        edges {
          node {
            user {
              __typename
              id
              displayName
              avatarUrl
            }
          }
        }
      }
      ...ActorErrorFields
    }
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        name
        createdById
        coOwnerIds
        item(id: $bottleId) {
          __typename
          id
          cellarId
          openAt
          emptyAt
          percentageRemaining
          displayImageId
          displayImage {
            __typename
            id
            placeholder
            file {
              __typename
              id
              url
            }
          }
          checkIns(first: 100) {
            totalCount
            edges {
              node {
                __typename
                id
                createdAt
                userId
                user {
                  __typename
                  id
                  displayName
                  avatarUrl
                }
              }
            }
          }
          item {
            ...ItemPageItem
            ...ItemPageRecipes
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemPageItemFragment, ItemPageRecipesFragment, ActorErrorFieldsFragment],
);

/**
 * An id at a cellar-item URL that is not a bottle there: is it a catalog item
 * id with exactly one bottle in this cellar (decision 1)?
 */
export const CellarBottleForQuery = graphql(
  `
  query CellarBottleFor($cellarId: ID!, $itemId: ID!, $type: ItemType!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        bottleFor(itemId: $itemId, type: $type) {
          __typename
          id
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * `/cellars/[cellarId]/{type}s/[bottleId]/edit` — which item that bottle
 * holds, so the edit form edits the item (the old page passed the bottle id
 * to `wines_by_pk`, which is why it never worked).
 */
export const CellarBottleItemQuery = graphql(
  `
  query CellarBottleItem($cellarId: ID!, $bottleId: ID!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        name
        item(id: $bottleId) {
          __typename
          id
          item {
            __typename
            id
            type
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** The bottle's display photo (`ItemImageWithCaptureClient`). */
export const SetCellarItemDisplayImageMutation = graphql(
  `
  mutation SetCellarItemDisplayImage(
    $cellarId: ID!
    $cellarItemId: ID!
    $displayImageId: ID!
  ) {
    updateCellarItem(
      cellarId: $cellarId
      cellarItemId: $cellarItemId
      input: { displayImageId: $displayImageId }
    ) {
      __typename
      ... on CellarItem {
        id
        displayImageId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
