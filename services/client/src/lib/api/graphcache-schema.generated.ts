/**
 * GENERATED — do not edit. Regenerate with:
 *
 *   node src/lib/api/graphcache-schema-codegen.ts
 *
 * The minified introspection of `packages/schema/schema.graphql`, passed to
 * `cacheExchange({ schema })` in `urql-client.ts` so graphcache resolves
 * interfaces and unions by `isSubType` instead of guessing. Without it the
 * `...ActorErrorFields` spread (a fragment on the abstract `ActorError`)
 * on a mutation result comes back as a bare `__typename` and the UI renders
 * "Something went wrong." instead of the actor's own explanation.
 *
 * `graphcache-schema.test.ts` fails when this file drifts from the SDL;
 * `urql-client.test.ts` fails when the fields stop surviving the cache. Why
 * this form and not the full introspection, with the size numbers:
 * `graphcache-schema-codegen.ts`.
 */

/** A GraphQL type reference, wrappers included: `NON_NULL(LIST(Item))`. */
export type MinifiedTypeRef = {
  readonly kind: string;
  readonly name?: string;
  readonly ofType?: MinifiedTypeRef;
};

/** A field, reduced to what graphcache reads: its name and its nullability. */
export type MinifiedField = {
  readonly name: string;
  readonly type: MinifiedTypeRef;
};

export type MinifiedCompositeType =
  | {
      readonly kind: "OBJECT" | "INTERFACE";
      readonly name: string;
      readonly fields: readonly MinifiedField[];
      readonly interfaces: readonly MinifiedTypeRef[];
    }
  | {
      readonly kind: "UNION";
      readonly name: string;
      readonly possibleTypes: readonly MinifiedTypeRef[];
    };

/**
 * Structurally a `PartialIntrospectionSchema`, which is what
 * `cacheExchange({ schema })` accepts.
 */
export type MinifiedIntrospection = {
  readonly __schema: {
    readonly queryType: { readonly name: string };
    readonly mutationType: { readonly name: string } | null;
    readonly subscriptionType: { readonly name: string } | null;
    readonly types: readonly MinifiedCompositeType[];
  };
};

export const graphcacheSchema: MinifiedIntrospection = {
  __schema: {
    queryType: { name: "Query" },
    mutationType: { name: "Mutation" },
    subscriptionType: null,
    types: [
      {
        kind: "OBJECT",
        name: "AcceptFriendInvitePayload",
        fields: [
          {
            name: "becameFriends",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "friendId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "AcceptFriendInviteResult",
        possibleTypes: [
          { kind: "OBJECT", name: "AcceptFriendInvitePayload" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "AcceptFriendRequestPayload",
        fields: [
          {
            name: "created",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "friendId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "requestId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "AcceptFriendRequestResult",
        possibleTypes: [
          { kind: "OBJECT", name: "AcceptFriendRequestPayload" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "AcceptPlaceSuggestionResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Place" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "ActOnMenuScanSuggestionResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MatchSuggestionActionPayload" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "ActivityEntry",
        fields: [
          { name: "cellar", type: { kind: "OBJECT", name: "Cellar" } },
          { name: "cellarItemId", type: { kind: "SCALAR", name: "ID" } },
          { name: "checkIn", type: { kind: "OBJECT", name: "ItemCheckIn" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActivityKind" },
            },
          },
          {
            name: "occurredAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          { name: "rank", type: { kind: "SCALAR", name: "Int" } },
          { name: "review", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "tierListItem",
            type: { kind: "OBJECT", name: "TierListItem" },
          },
          { name: "user", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ActivityEntryConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ActivityEntryEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ActivityEntryEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ActivityEntry" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "INTERFACE",
        name: "ActorError",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActorErrorCode" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "reason", type: { kind: "ENUM", name: "ActorErrorReason" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Error" }],
      },
      {
        kind: "UNION",
        name: "AddItemReviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemReview" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "AddItemToCellarResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarItem" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "AddRecipeReviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeReview" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "AddTierListItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierListItem" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "AddTierListItemsPayload",
        fields: [
          {
            name: "added",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "skippedCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "AddTierListItemsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "AddTierListItemsPayload" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "AiCapabilities",
        fields: [
          {
            name: "detailSuggestions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "imageSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "labelRead",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "menuScan",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "recipePhoto",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "semanticSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "tierListInsights",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "AiJob",
        fields: [
          { name: "count", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "failureCode",
            type: { kind: "ENUM", name: "ActorErrorCode" },
          },
          {
            name: "failureReason",
            type: { kind: "ENUM", name: "ActorErrorReason" },
          },
          { name: "finishedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "itemType", type: { kind: "ENUM", name: "ItemType" } },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "AiJobKind" },
            },
          },
          { name: "placeId", type: { kind: "SCALAR", name: "ID" } },
          { name: "placeName", type: { kind: "SCALAR", name: "String" } },
          { name: "recipeId", type: { kind: "SCALAR", name: "ID" } },
          { name: "recipeName", type: { kind: "SCALAR", name: "String" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "startedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "AiJobStatus" },
            },
          },
          {
            name: "subjectId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "tierListName", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "AiJobConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "AiJobEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "AiJobEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "AiJob" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "AttachItemImageResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemImage" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "BarPantry",
        fields: [
          {
            name: "have",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "ENUM", name: "IngredientKind" },
                },
              },
            },
          },
          {
            name: "kinds",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "ENUM", name: "IngredientKind" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BarPantryEntry",
        fields: [
          {
            name: "have",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "IngredientKind" },
            },
          },
          {
            name: "label",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BarRecipeMatch",
        fields: [
          {
            name: "makeability",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeMakeability" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
          { name: "recipeGroupId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BarRecipeMatchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "BarRecipeMatchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BarRecipeMatchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BarRecipeMatch" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Barcode",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "items",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemConnection" },
            },
          },
          { name: "type", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Beer",
        fields: [
          {
            name: "alcoholContentPercentage",
            type: { kind: "SCALAR", name: "Float" },
          },
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          {
            name: "internationalBitternessUnit",
            type: { kind: "SCALAR", name: "Int" },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          { name: "style", type: { kind: "SCALAR", name: "String" } },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "vintage", type: { kind: "SCALAR", name: "Date" } },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Item" }],
      },
      {
        kind: "OBJECT",
        name: "BottleLogSummary",
        fields: [
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "firstAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "lastAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "lastNote", type: { kind: "SCALAR", name: "String" } },
          { name: "lastScore", type: { kind: "SCALAR", name: "Float" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BottleSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "BottleSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BottleSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BottleSearchHit" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BottleSearchHit",
        fields: [
          {
            name: "bottleCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "cellarId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "cellarItemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "cellarName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Brand",
        fields: [
          { name: "brandType", type: { kind: "ENUM", name: "BrandType" } },
          {
            name: "childBrands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BrandConnection" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          { name: "firstItemType", type: { kind: "ENUM", name: "ItemType" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "itemLinks",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          {
            name: "items",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemConnection" },
            },
          },
          { name: "logoUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "parentBrand", type: { kind: "OBJECT", name: "Brand" } },
          { name: "parentBrandId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "places",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceBrandConnection" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BrandConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "BrandEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BrandEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Brand" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BrandSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "BrandSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BrandSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BrandSearchResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BrandSearchResult",
        fields: [
          {
            name: "brand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Brand" },
            },
          },
          { name: "brandType", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "logoUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "BudgetExceededError",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActorErrorCode" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "reason", type: { kind: "ENUM", name: "ActorErrorReason" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [
          { kind: "INTERFACE", name: "ActorError" },
          { kind: "INTERFACE", name: "Error" },
        ],
      },
      {
        kind: "OBJECT",
        name: "BulkCheckInPayload",
        fields: [
          {
            name: "cellarItemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CheckInConnection" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "BulkCheckInResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "BulkCheckInPayload" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CancelRecipePhotoJobResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipePhotoJob" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "Cellar",
        fields: [
          { name: "bottleFor", type: { kind: "OBJECT", name: "CellarItem" } },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CheckInConnection" },
            },
          },
          {
            name: "coOwnerIds",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            },
          },
          {
            name: "coOwners",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfileConnection" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "createdBy", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "dashboard",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarDashboard" },
            },
          },
          {
            name: "drinkSoon",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "DrinkSoonConnection" },
            },
          },
          {
            name: "finishedCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "item", type: { kind: "OBJECT", name: "CellarItem" } },
          {
            name: "itemCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "itemCounts",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemTypeCounts" },
            },
          },
          {
            name: "itemGroups",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemGroupConnection" },
            },
          },
          {
            name: "items",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "privacy",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PermissionType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "CellarEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarDashboard",
        fields: [
          {
            name: "addedRecently",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "almostEmptyAt",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "almostEmptyCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "bottleCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "currentMonth",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "finishedCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "finishedThisMonth",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "logsByMonth",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "Int" },
                },
              },
            },
          },
          {
            name: "openCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "recentDays",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "timeZone",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Cellar" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItem",
        fields: [
          { name: "acquiredOn", type: { kind: "SCALAR", name: "Date" } },
          { name: "cellar", type: { kind: "OBJECT", name: "Cellar" } },
          {
            name: "cellarId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CheckInConnection" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdBy",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "displayImage", type: { kind: "OBJECT", name: "ItemImage" } },
          { name: "displayImageId", type: { kind: "SCALAR", name: "ID" } },
          { name: "distance", type: { kind: "SCALAR", name: "Float" } },
          { name: "drinkFrom", type: { kind: "SCALAR", name: "Date" } },
          { name: "drinkUntil", type: { kind: "SCALAR", name: "Date" } },
          { name: "emptyAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          { name: "location", type: { kind: "SCALAR", name: "String" } },
          { name: "myLog", type: { kind: "OBJECT", name: "BottleLogSummary" } },
          { name: "openAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "packagedOn", type: { kind: "SCALAR", name: "Date" } },
          {
            name: "percentageRemaining",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          { name: "priceAmount", type: { kind: "SCALAR", name: "Float" } },
          { name: "priceCurrency", type: { kind: "SCALAR", name: "String" } },
          { name: "sourceMenuItemId", type: { kind: "SCALAR", name: "ID" } },
          { name: "sourcePlaceId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "sourceType",
            type: { kind: "ENUM", name: "CellarItemSource" },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "CellarItemEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItem" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemGroup",
        fields: [
          {
            name: "bottleIds",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            },
          },
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "lead",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItem" },
            },
          },
          { name: "match", type: { kind: "ENUM", name: "CellarSearchMatch" } },
          {
            name: "openCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemGroupConnection",
        fields: [
          {
            name: "bottleCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "CellarItemGroupEdge" },
                },
              },
            },
          },
          {
            name: "meaning",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "CellarSearchMeaning" },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemGroupEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemGroup" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "CellarItemSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemSearchResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarItemSearchResult",
        fields: [
          {
            name: "cellarItemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "distance", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarSearchElsewhereConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "CellarSearchElsewhereEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarSearchElsewhereEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarSearchElsewhereHit" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CellarSearchElsewhereHit",
        fields: [
          {
            name: "cellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Cellar" },
            },
          },
          {
            name: "group",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemGroup" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CheckIn",
        fields: [
          {
            name: "cellarItemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "user", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CheckInConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "CheckInEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "CheckInEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CheckIn" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "CheckInResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CheckIn" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CloneTierListResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierList" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CloseItemOnboardingResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemOnboarding" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "Coffee",
        fields: [
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "cultivar", type: { kind: "SCALAR", name: "String" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "process", type: { kind: "SCALAR", name: "String" } },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          { name: "roastLevel", type: { kind: "SCALAR", name: "String" } },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          { name: "species", type: { kind: "SCALAR", name: "String" } },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Item" }],
      },
      {
        kind: "OBJECT",
        name: "CollectionStats",
        fields: [
          {
            name: "cellarCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "itemCounts",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemTypeCounts" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "ConfirmItemOnboardingResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConfirmedItemOnboarding" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "ConfirmedItemOnboarding",
        fields: [
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          { name: "brandId", type: { kind: "SCALAR", name: "ID" } },
          { name: "cellarItemId", type: { kind: "SCALAR", name: "ID" } },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "onboardingId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ConflictError",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActorErrorCode" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "reason", type: { kind: "ENUM", name: "ActorErrorReason" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [
          { kind: "INTERFACE", name: "ActorError" },
          { kind: "INTERFACE", name: "Error" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateCellarResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "Cellar" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateGenericItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "GenericItem" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MutationCreateItemSuccess" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateMenuScanResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MenuScan" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "CreatePlacePayload",
        fields: [
          {
            name: "nearbyDuplicates",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "DuplicatePlaceConnection" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          { name: "review", type: { kind: "OBJECT", name: "PlaceReview" } },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "CreatePlaceResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "CreatePlacePayload" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateRecipeGroupResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeGroup" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateRecipeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Recipe" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateTierListResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierList" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "CreateUploadTargetResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "UploadTarget" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteCellarResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedCellar" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteDrinkLogResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedDrinkLogPayload" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteFileResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedFile" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteItemReviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedItemReview" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeletePlaceResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedPlace" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteRecipeGroupResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedRecipeGroup" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteRecipeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedRecipe" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteRecipeReviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedRecipeReview" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "DeleteTierListResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DeletedTierList" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "DeletedCellar",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedDrinkLogPayload",
        fields: [
          {
            name: "ids",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedFile",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedItemReview",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedPlace",
        fields: [
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedRecipe",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedRecipeGroup",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedRecipeReview",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DeletedTierList",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "DetachItemImageResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DetachedItemImage" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "DetachedItemImage",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "DismissPlaceSuggestionsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Place" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "DrinkSoonBottle",
        fields: [
          {
            name: "bottle",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItem" },
            },
          },
          { name: "openDays", type: { kind: "SCALAR", name: "Int" } },
          { name: "openLifeFromDays", type: { kind: "SCALAR", name: "Int" } },
          { name: "openLifeUntilDays", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "reason",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "DrinkSoonReason" },
            },
          },
          { name: "typicalFor", type: { kind: "SCALAR", name: "String" } },
          {
            name: "urgency",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "DrinkSoonUrgency" },
            },
          },
          { name: "window", type: { kind: "OBJECT", name: "DrinkWindow" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DrinkSoonConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "DrinkSoonEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DrinkSoonEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "DrinkSoonBottle" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DrinkWindow",
        fields: [
          { name: "from", type: { kind: "SCALAR", name: "Date" } },
          {
            name: "fromSource",
            type: { kind: "ENUM", name: "DrinkWindowSource" },
          },
          { name: "until", type: { kind: "SCALAR", name: "Date" } },
          {
            name: "untilSource",
            type: { kind: "ENUM", name: "DrinkWindowSource" },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DuplicatePlaceCandidate",
        fields: [
          {
            name: "distanceMeters",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "similarity",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DuplicatePlaceConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "DuplicatePlaceEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "DuplicatePlaceEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "DuplicatePlaceCandidate" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "EmptyCellarItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarItem" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "EnrichPlaceFromGoogleResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "EnrichPlacePayload" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "EnrichPlacePayload",
        fields: [
          {
            name: "collision",
            type: { kind: "OBJECT", name: "GoogleBindingCollision" },
          },
          {
            name: "enrichment",
            type: { kind: "OBJECT", name: "PlaceEnrichment" },
          },
          {
            name: "photos",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlacePhotoConnection" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "reason",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PlaceEnrichmentStatus" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "EnsureBarcodeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "Barcode" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "EnsureFriendInviteResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendInvite" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "INTERFACE",
        name: "Error",
        fields: [
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "File",
        fields: [
          {
            name: "bucket",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "etag", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "key",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "metadata",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          { name: "mimeType", type: { kind: "SCALAR", name: "String" } },
          { name: "size", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "uploadedBy", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "url",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "urlExpiresAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "verifiedAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FlavourTagSuggestion",
        fields: [
          {
            name: "evidence",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "tag",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FlavourTagSuggestionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "FlavourTagSuggestionEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FlavourTagSuggestionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "FlavourTagSuggestion" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FlavourTagSuggestionsPayload",
        fields: [
          {
            name: "abstained",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "suggestions",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "OBJECT",
                name: "FlavourTagSuggestionConnection",
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ForbiddenError",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActorErrorCode" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "reason", type: { kind: "ENUM", name: "ActorErrorReason" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [
          { kind: "INTERFACE", name: "ActorError" },
          { kind: "INTERFACE", name: "Error" },
        ],
      },
      {
        kind: "OBJECT",
        name: "Friend",
        fields: [
          {
            name: "since",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "user",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfile" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "FriendEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Friend" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendInvite",
        fields: [
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "token",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendInvitePreview",
        fields: [
          {
            name: "inviterAvatarUrl",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "inviterDisplayName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "inviterId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "FriendInviteStatus" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendProfile",
        fields: [
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "since",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "tierLists",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListConnection" },
            },
          },
          {
            name: "user",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfile" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendRequest",
        fields: [
          {
            name: "direction",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "FriendRequestDirection" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "recipientId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "requesterId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "FriendRequestStatus" },
            },
          },
          {
            name: "user",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfile" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendRequestConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "FriendRequestEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "FriendRequestEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "FriendRequest" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GenericItem",
        fields: [
          {
            name: "category",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "createdById", type: { kind: "SCALAR", name: "ID" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isSubstitutable",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "GenericItemKind" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "subcategory", type: { kind: "SCALAR", name: "String" } },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GeocodeResult",
        fields: [
          {
            name: "displayName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "latitude",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "longitude",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GoogleBindingCollision",
        fields: [
          {
            name: "boundTo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "boundToPlaceId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "googlePlaceId",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GooglePlaceDetailsPayload",
        fields: [
          {
            name: "charged",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "details",
            type: { kind: "OBJECT", name: "GooglePlacePrefill" },
          },
          {
            name: "reason",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GooglePlacePrefill",
        fields: [
          {
            name: "editorialSummary",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "googlePlaceId",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "name", type: { kind: "SCALAR", name: "String" } },
          { name: "phone", type: { kind: "SCALAR", name: "String" } },
          {
            name: "types",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          { name: "website", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GooglePlaceSuggestion",
        fields: [
          {
            name: "googlePlaceId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "location", type: { kind: "OBJECT", name: "LngLat" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "secondaryText", type: { kind: "SCALAR", name: "String" } },
          {
            name: "types",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GooglePlaceSuggestionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "GooglePlaceSuggestionEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GooglePlaceSuggestionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "GooglePlaceSuggestion" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "GooglePlacesPayload",
        fields: [
          {
            name: "charged",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "reason",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "suggestions",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "OBJECT",
                name: "GooglePlaceSuggestionConnection",
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "IngredientAvailability",
        fields: [
          { name: "cellarId", type: { kind: "SCALAR", name: "ID" } },
          { name: "cellarItemId", type: { kind: "SCALAR", name: "ID" } },
          { name: "label", type: { kind: "SCALAR", name: "String" } },
          { name: "opened", type: { kind: "SCALAR", name: "Boolean" } },
          {
            name: "source",
            type: { kind: "ENUM", name: "AvailabilitySource" },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "AvailabilityStatus" },
            },
          },
          { name: "via", type: { kind: "ENUM", name: "IngredientKind" } },
        ],
        interfaces: [],
      },
      {
        kind: "INTERFACE",
        name: "Item",
        fields: [
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemBrand",
        fields: [
          {
            name: "brand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Brand" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isPrimary",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemBrandConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ItemBrandEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemBrandEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrand" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemCheckIn",
        fields: [
          {
            name: "canRemove",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "companionIds",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            },
          },
          {
            name: "companions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfileConnection" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "fromCellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isMine",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          { name: "note", type: { kind: "SCALAR", name: "String" } },
          { name: "photo", type: { kind: "OBJECT", name: "File" } },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          { name: "score", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "tags",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "user", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemCheckInConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ItemCheckInEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemCheckInEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckIn" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemCocktails",
        fields: [
          { name: "kind", type: { kind: "ENUM", name: "IngredientKind" } },
          { name: "kindLabel", type: { kind: "SCALAR", name: "String" } },
          {
            name: "recipes",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BarRecipeMatchConnection" },
            },
          },
          {
            name: "total",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "useItUp",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ItemEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemCorrection",
        fields: [
          {
            name: "canRereadLabel",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "canSuggestDetails",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemDetailSuggestions",
        fields: [
          {
            name: "abstained",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "defaults",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          { name: "model", type: { kind: "SCALAR", name: "String" } },
          { name: "note", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemImage",
        fields: [
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "file",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "File" },
            },
          },
          {
            name: "fileId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isPublic",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          { name: "placeholder", type: { kind: "SCALAR", name: "String" } },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemImageConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ItemImageEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemImageEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImage" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemLabelReading",
        fields: [
          { name: "brandName", type: { kind: "SCALAR", name: "String" } },
          {
            name: "confidence",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "defaults",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          {
            name: "model",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemOnboarding",
        fields: [
          { name: "aiModel", type: { kind: "SCALAR", name: "String" } },
          { name: "backLabelImageId", type: { kind: "SCALAR", name: "ID" } },
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          { name: "barcodeType", type: { kind: "SCALAR", name: "String" } },
          { name: "confidence", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "defaults", type: { kind: "SCALAR", name: "JSON" } },
          { name: "frontLabelImageId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "OnboardingStatus" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "ItemOnboardingDefaultsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemOnboarding" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "ItemReview",
        fields: [
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          { name: "text", type: { kind: "SCALAR", name: "JSON" } },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "user", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemReviewConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ItemReviewEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemReviewEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReview" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemScore",
        fields: [
          { name: "average", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ItemSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemSearchResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemSearchResult",
        fields: [
          { name: "distance", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ItemTypeCounts",
        fields: [
          {
            name: "beer",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "coffee",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "sake",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "spirit",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "tea",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "total",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "wine",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "LinkBarcodeItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "LinkedBarcodeItem" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "LinkItemBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemBrand" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "LinkPlaceBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "PlaceBrand" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "LinkedBarcodeItem",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          { name: "outboxRowId", type: { kind: "SCALAR", name: "ID" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "LngLat",
        fields: [
          {
            name: "lat",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "lng",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "LogDrinkResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "LoggedDrinkPayload" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "LoggedDrinkPayload",
        fields: [
          {
            name: "drinkerCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "entry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckIn" },
            },
          },
          {
            name: "entryIds",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MapCluster",
        fields: [
          { name: "center", type: { kind: "OBJECT", name: "LngLat" } },
          {
            name: "clusterId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "MapEntry",
        possibleTypes: [
          { kind: "OBJECT", name: "MapCluster" },
          { kind: "OBJECT", name: "MapPlace" },
        ],
      },
      {
        kind: "OBJECT",
        name: "MapEntryConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "MapEntryEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MapEntryEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "MapEntry" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MapPlace",
        fields: [
          {
            name: "categories",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          { name: "confidence", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "isVerified", type: { kind: "SCALAR", name: "Boolean" } },
          { name: "location", type: { kind: "OBJECT", name: "LngLat" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "primaryCategory", type: { kind: "SCALAR", name: "String" } },
          { name: "rating", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "reviewStatus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PlaceReviewStatus" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MatchSuggestion",
        fields: [
          { name: "accepted", type: { kind: "SCALAR", name: "Boolean" } },
          { name: "actedAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "actedBy", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "confidenceScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "matchReasoning", type: { kind: "SCALAR", name: "String" } },
          {
            name: "menuItemName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "menuScanId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "placeMenuItem",
            type: { kind: "OBJECT", name: "PlaceMenuItem" },
          },
          {
            name: "placeMenuItemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "rejected", type: { kind: "SCALAR", name: "Boolean" } },
          { name: "similarityMetrics", type: { kind: "SCALAR", name: "JSON" } },
          { name: "suggestedItem", type: { kind: "INTERFACE", name: "Item" } },
          { name: "suggestedRecipe", type: { kind: "OBJECT", name: "Recipe" } },
          {
            name: "targetKind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "MatchSuggestionTargetKind" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MatchSuggestionActionPayload",
        fields: [
          {
            name: "propagated",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "suggestion",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "MatchSuggestion" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MatchSuggestionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "MatchSuggestionEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MatchSuggestionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "MatchSuggestion" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuItemMatch",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "MenuItemType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuLineForYou",
        fields: [
          { name: "cellar", type: { kind: "OBJECT", name: "Cellar" } },
          {
            name: "friendsWhoLovedCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsWhoLovedNames",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "likeYouRated",
            type: { kind: "OBJECT", name: "MenuLineLikeYouRated" },
          },
          { name: "yourScore", type: { kind: "SCALAR", name: "Float" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuLineLikeYouRated",
        fields: [
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuScan",
        fields: [
          { name: "confidenceScore", type: { kind: "SCALAR", name: "Float" } },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "estimatedPlaceId", type: { kind: "SCALAR", name: "ID" } },
          { name: "extractedText", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemsDetected",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "itemsMatched",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "manualPlaceOverride", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "matchCounts",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "MenuScanMatchCounts" },
            },
          },
          {
            name: "matchStatus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "MenuScanMatchStatus" },
            },
          },
          {
            name: "menuItems",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceMenuItemConnection" },
            },
          },
          {
            name: "originalImageId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          { name: "placeId", type: { kind: "SCALAR", name: "ID" } },
          { name: "processedAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "processedImageId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "processingDurationMs",
            type: { kind: "SCALAR", name: "Int" },
          },
          { name: "processingError", type: { kind: "SCALAR", name: "String" } },
          { name: "processingModel", type: { kind: "SCALAR", name: "String" } },
          {
            name: "processingStatus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "MenuScanStatus" },
            },
          },
          { name: "scannedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "suggestions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "MatchSuggestionConnection" },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuScanConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "MenuScanEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuScanEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "MenuScan" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MenuScanMatchCounts",
        fields: [
          {
            name: "lines",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "matched",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "toConfirm",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Mutation",
        fields: [
          {
            name: "acceptFriendInvite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AcceptFriendInviteResult" },
            },
          },
          {
            name: "acceptFriendRequest",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AcceptFriendRequestResult" },
            },
          },
          {
            name: "acceptPlaceSuggestion",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AcceptPlaceSuggestionResult" },
            },
          },
          {
            name: "actOnMenuScanSuggestion",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ActOnMenuScanSuggestionResult" },
            },
          },
          {
            name: "addItemReview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AddItemReviewResult" },
            },
          },
          {
            name: "addItemToCellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AddItemToCellarResult" },
            },
          },
          {
            name: "addRecipeReview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AddRecipeReviewResult" },
            },
          },
          {
            name: "addTierListItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AddTierListItemResult" },
            },
          },
          {
            name: "addTierListItems",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AddTierListItemsResult" },
            },
          },
          {
            name: "attachItemImage",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "AttachItemImageResult" },
            },
          },
          {
            name: "bulkCheckIn",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "BulkCheckInResult" },
            },
          },
          {
            name: "cancelRecipePhotoJob",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CancelRecipePhotoJobResult" },
            },
          },
          {
            name: "checkIn",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CheckInResult" },
            },
          },
          {
            name: "cloneTierList",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CloneTierListResult" },
            },
          },
          {
            name: "closeItemOnboarding",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CloseItemOnboardingResult" },
            },
          },
          {
            name: "confirmItemOnboarding",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ConfirmItemOnboardingResult" },
            },
          },
          {
            name: "createCellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateCellarResult" },
            },
          },
          {
            name: "createGenericItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateGenericItemResult" },
            },
          },
          {
            name: "createItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateItemResult" },
            },
          },
          {
            name: "createMenuScan",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateMenuScanResult" },
            },
          },
          {
            name: "createPlace",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreatePlaceResult" },
            },
          },
          {
            name: "createRecipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateRecipeResult" },
            },
          },
          {
            name: "createRecipeGroup",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateRecipeGroupResult" },
            },
          },
          {
            name: "createTierList",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateTierListResult" },
            },
          },
          {
            name: "createUploadTarget",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "CreateUploadTargetResult" },
            },
          },
          {
            name: "deleteCellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteCellarResult" },
            },
          },
          {
            name: "deleteDrinkLog",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteDrinkLogResult" },
            },
          },
          {
            name: "deleteFile",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteFileResult" },
            },
          },
          {
            name: "deleteItemReview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteItemReviewResult" },
            },
          },
          {
            name: "deletePlace",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeletePlaceResult" },
            },
          },
          {
            name: "deleteRecipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteRecipeResult" },
            },
          },
          {
            name: "deleteRecipeGroup",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteRecipeGroupResult" },
            },
          },
          {
            name: "deleteRecipeReview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteRecipeReviewResult" },
            },
          },
          {
            name: "deleteTierList",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DeleteTierListResult" },
            },
          },
          {
            name: "detachItemImage",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DetachItemImageResult" },
            },
          },
          {
            name: "dismissPlaceSuggestions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "DismissPlaceSuggestionsResult" },
            },
          },
          {
            name: "emptyCellarItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "EmptyCellarItemResult" },
            },
          },
          {
            name: "enrichPlaceFromGoogle",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "EnrichPlaceFromGoogleResult" },
            },
          },
          {
            name: "ensureBarcode",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "EnsureBarcodeResult" },
            },
          },
          {
            name: "ensureFriendInvite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "EnsureFriendInviteResult" },
            },
          },
          {
            name: "itemOnboardingDefaults",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ItemOnboardingDefaultsResult" },
            },
          },
          {
            name: "linkBarcodeItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "LinkBarcodeItemResult" },
            },
          },
          {
            name: "linkItemBrand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "LinkItemBrandResult" },
            },
          },
          {
            name: "linkPlaceBrand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "LinkPlaceBrandResult" },
            },
          },
          {
            name: "logDrink",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "LogDrinkResult" },
            },
          },
          {
            name: "openCellarItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "OpenCellarItemResult" },
            },
          },
          {
            name: "openItemDraft",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "OpenItemDraftResult" },
            },
          },
          {
            name: "ping",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "PingResult" },
            },
          },
          {
            name: "recordPlaceAccess",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RecordPlaceAccessResult" },
            },
          },
          {
            name: "recordPlaceInteraction",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RecordPlaceInteractionResult" },
            },
          },
          {
            name: "redoTierListEdit",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RedoTierListEditResult" },
            },
          },
          {
            name: "rejectFriendRequest",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RejectFriendRequestResult" },
            },
          },
          {
            name: "removeFriend",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RemoveFriendResult" },
            },
          },
          {
            name: "removeItemFromCellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RemoveItemFromCellarResult" },
            },
          },
          {
            name: "removeRecipeVote",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RemoveRecipeVoteResult" },
            },
          },
          {
            name: "removeTierListItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RemoveTierListItemResult" },
            },
          },
          {
            name: "reorderTierListBand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ReorderTierListBandResult" },
            },
          },
          {
            name: "replaceItemBrand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ReplaceItemBrandResult" },
            },
          },
          {
            name: "rereadItemLabel",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RereadItemLabelResult" },
            },
          },
          {
            name: "resetFriendInvite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ResetFriendInviteResult" },
            },
          },
          {
            name: "resolveBrand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ResolveBrandResult" },
            },
          },
          {
            name: "restoreDrinkLog",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "RestoreDrinkLogResult" },
            },
          },
          {
            name: "resubmitPlace",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "ResubmitPlaceResult" },
            },
          },
          {
            name: "sendFriendRequest",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SendFriendRequestResult" },
            },
          },
          {
            name: "setBarPantryItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetBarPantryItemResult" },
            },
          },
          {
            name: "setBrandParent",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetBrandParentResult" },
            },
          },
          {
            name: "setCellarItemPercentage",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetCellarItemPercentageResult" },
            },
          },
          {
            name: "setDrinkLogCompanions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetDrinkLogCompanionsResult" },
            },
          },
          {
            name: "setFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetFavoriteResult" },
            },
          },
          {
            name: "setRecipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetRecipeIngredientsResult" },
            },
          },
          {
            name: "setRecipeInstructions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetRecipeInstructionsResult" },
            },
          },
          {
            name: "setRecipeLove",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetRecipeLoveResult" },
            },
          },
          {
            name: "setWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SetWantToTryResult" },
            },
          },
          {
            name: "startItemOnboarding",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "StartItemOnboardingResult" },
            },
          },
          {
            name: "startRecipePhotoJob",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "StartRecipePhotoJobResult" },
            },
          },
          {
            name: "startRecipeTextJob",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "StartRecipeTextJobResult" },
            },
          },
          {
            name: "suggestFlavourTags",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SuggestFlavourTagsResult" },
            },
          },
          {
            name: "suggestItemDetails",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SuggestItemDetailsResult" },
            },
          },
          {
            name: "suggestNewItemDetails",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "SuggestNewItemDetailsResult" },
            },
          },
          {
            name: "undoTierListEdit",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UndoTierListEditResult" },
            },
          },
          {
            name: "unlinkItemBrand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UnlinkItemBrandResult" },
            },
          },
          {
            name: "updateBrand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateBrandResult" },
            },
          },
          {
            name: "updateCellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateCellarResult" },
            },
          },
          {
            name: "updateCellarItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateCellarItemResult" },
            },
          },
          {
            name: "updateDrinkLog",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateDrinkLogResult" },
            },
          },
          {
            name: "updateGenericItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateGenericItemResult" },
            },
          },
          {
            name: "updateItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateItemResult" },
            },
          },
          {
            name: "updateItemReview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateItemReviewResult" },
            },
          },
          {
            name: "updateProfile",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateProfileResult" },
            },
          },
          {
            name: "updateRecipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateRecipeResult" },
            },
          },
          {
            name: "updateRecipeGroup",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateRecipeGroupResult" },
            },
          },
          {
            name: "updateRecipeReview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateRecipeReviewResult" },
            },
          },
          {
            name: "updateTierList",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "UpdateTierListResult" },
            },
          },
          {
            name: "verifyMenuItemMatch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "VerifyMenuItemMatchResult" },
            },
          },
          {
            name: "verifyUpload",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "VerifyUploadResult" },
            },
          },
          {
            name: "voteOnRecipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "VoteOnRecipeResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MutationCreateItemSuccess",
        fields: [
          {
            name: "data",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "MutationUpdateItemSuccess",
        fields: [
          {
            name: "data",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "NearbyPlace",
        fields: [
          {
            name: "distanceMeters",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "NearbyPlaceConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "NearbyPlaceEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "NearbyPlaceEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "NearbyPlace" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "NotFoundError",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActorErrorCode" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "reason", type: { kind: "ENUM", name: "ActorErrorReason" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [
          { kind: "INTERFACE", name: "ActorError" },
          { kind: "INTERFACE", name: "Error" },
        ],
      },
      {
        kind: "UNION",
        name: "OpenCellarItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarItem" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "OpenItemDraftResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemOnboarding" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "PageInfo",
        fields: [
          { name: "endCursor", type: { kind: "SCALAR", name: "String" } },
          {
            name: "hasNextPage",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "hasPreviousPage",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "startCursor", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "PingResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Pong" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "Place",
        fields: [
          {
            name: "accessCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceBrandConnection" },
            },
          },
          {
            name: "categories",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          { name: "confidence", type: { kind: "SCALAR", name: "Float" } },
          { name: "countryCode", type: { kind: "SCALAR", name: "String" } },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "createdById", type: { kind: "SCALAR", name: "ID" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          { name: "displayName", type: { kind: "SCALAR", name: "String" } },
          { name: "email", type: { kind: "SCALAR", name: "String" } },
          {
            name: "enrichment",
            type: { kind: "OBJECT", name: "PlaceEnrichment" },
          },
          { name: "googlePlaceId", type: { kind: "SCALAR", name: "String" } },
          { name: "hours", type: { kind: "SCALAR", name: "JSON" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isActive",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isVerified",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "lastAccessedAt",
            type: { kind: "SCALAR", name: "DateTime" },
          },
          { name: "lastSyncAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "locality", type: { kind: "SCALAR", name: "String" } },
          {
            name: "location",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "LngLat" },
            },
          },
          {
            name: "menuItems",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceMenuItemConnection" },
            },
          },
          {
            name: "menus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceMenuConnection" },
            },
          },
          {
            name: "myInteraction",
            type: { kind: "OBJECT", name: "PlaceInteraction" },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "overtureId", type: { kind: "SCALAR", name: "String" } },
          { name: "phone", type: { kind: "SCALAR", name: "String" } },
          {
            name: "photos",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlacePhotoConnection" },
            },
          },
          { name: "postcode", type: { kind: "SCALAR", name: "String" } },
          { name: "priceLevel", type: { kind: "SCALAR", name: "Int" } },
          { name: "primaryCategory", type: { kind: "SCALAR", name: "String" } },
          { name: "rating", type: { kind: "SCALAR", name: "Float" } },
          { name: "region", type: { kind: "SCALAR", name: "String" } },
          { name: "rejectionReason", type: { kind: "SCALAR", name: "String" } },
          { name: "reviewCount", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "reviewStatus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PlaceReviewStatus" },
            },
          },
          { name: "reviewedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "source",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "streetAddress", type: { kind: "SCALAR", name: "String" } },
          {
            name: "suggestedCategories",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "suggestedDescription",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "website", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceBrand",
        fields: [
          {
            name: "brandId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "relationshipType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PlaceBrandRelationship" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceBrandConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "PlaceBrandEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceBrandEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceBrand" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceEnrichment",
        fields: [
          {
            name: "attributions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "detailsFetchedAt",
            type: { kind: "SCALAR", name: "DateTime" },
          },
          {
            name: "googleBusinessStatus",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "googleEditorialSummary",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "googleFormattedAddress",
            type: { kind: "SCALAR", name: "String" },
          },
          { name: "googleName", type: { kind: "SCALAR", name: "String" } },
          {
            name: "googleOpeningHours",
            type: { kind: "SCALAR", name: "JSON" },
          },
          { name: "googlePhone", type: { kind: "SCALAR", name: "String" } },
          {
            name: "googlePlaceId",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "googlePriceLevel", type: { kind: "SCALAR", name: "Int" } },
          { name: "googleRating", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "googleTypes",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "googleUserRatingsTotal",
            type: { kind: "SCALAR", name: "Int" },
          },
          { name: "googleWebsite", type: { kind: "SCALAR", name: "String" } },
          {
            name: "photosFetchedAt",
            type: { kind: "SCALAR", name: "DateTime" },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "resolvedVia",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "GoogleResolvedVia" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceInteraction",
        fields: [
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isVisited",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "lastVisitedAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "notes", type: { kind: "SCALAR", name: "String" } },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "rating", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "tags",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "visitCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "wantToVisit",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceInteractionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "PlaceInteractionEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceInteractionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceInteraction" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceMenu",
        fields: [
          { name: "confidenceScore", type: { kind: "SCALAR", name: "Float" } },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "createdById", type: { kind: "SCALAR", name: "ID" } },
          { name: "discoveredAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "discoveryMethod", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isCurrent",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "menuData",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          { name: "menuType", type: { kind: "SCALAR", name: "String" } },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "source",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "sourceUrl", type: { kind: "SCALAR", name: "String" } },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "validFrom", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "validUntil", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "verifiedById", type: { kind: "SCALAR", name: "ID" } },
          { name: "version", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceMenuConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "PlaceMenuEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceMenuEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceMenu" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceMenuItem",
        fields: [
          {
            name: "canCorrectMatch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "confidenceScore", type: { kind: "SCALAR", name: "Float" } },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "detectedItemType",
            type: { kind: "ENUM", name: "MenuItemType" },
          },
          {
            name: "extractedAttributes",
            type: { kind: "SCALAR", name: "JSON" },
          },
          { name: "forYou", type: { kind: "OBJECT", name: "MenuLineForYou" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isAvailable",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "matchVerifiedAt",
            type: { kind: "SCALAR", name: "DateTime" },
          },
          { name: "matchVerifiedById", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "matchedItem",
            type: { kind: "OBJECT", name: "MenuItemMatch" },
          },
          { name: "menuCategory", type: { kind: "SCALAR", name: "String" } },
          { name: "menuScanId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "placeMenuId", type: { kind: "SCALAR", name: "ID" } },
          { name: "price", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "seasonal",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceMenuItemConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "PlaceMenuItemEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceMenuItemEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceMenuItem" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlacePhoto",
        fields: [
          {
            name: "attributions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "displayOrder",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "file", type: { kind: "OBJECT", name: "File" } },
          { name: "fileId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "googlePhotoName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "height", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "width", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlacePhotoConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "PlacePhotoEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlacePhotoEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlacePhoto" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceReview",
        fields: [
          {
            name: "approved",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "confidenceAdjustment",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "enrichedDescription",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "flags",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          { name: "rejectionReason", type: { kind: "SCALAR", name: "String" } },
          {
            name: "suggestedCategories",
            type: {
              kind: "LIST",
              ofType: {
                kind: "NON_NULL",
                ofType: { kind: "SCALAR", name: "String" },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "PlaceSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PlaceSearchResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "PlaceSearchResult",
        fields: [
          {
            name: "categories",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "categoryScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "combinedScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "isVerified", type: { kind: "SCALAR", name: "Boolean" } },
          { name: "locality", type: { kind: "SCALAR", name: "String" } },
          { name: "location", type: { kind: "OBJECT", name: "LngLat" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          { name: "priceLevel", type: { kind: "SCALAR", name: "Int" } },
          { name: "primaryCategory", type: { kind: "SCALAR", name: "String" } },
          { name: "rating", type: { kind: "SCALAR", name: "Float" } },
          { name: "region", type: { kind: "SCALAR", name: "String" } },
          {
            name: "reviewStatus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PlaceReviewStatus" },
            },
          },
          { name: "streetAddress", type: { kind: "SCALAR", name: "String" } },
          {
            name: "textRank",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "trigramSimilarity",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Pong",
        fields: [
          {
            name: "actorId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "at",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "pong",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "turns",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Query",
        fields: [
          {
            name: "barPantry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryBarPantryResult" },
            },
          },
          {
            name: "barcode",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryBarcodeResult" },
            },
          },
          {
            name: "brand",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryBrandResult" },
            },
          },
          {
            name: "brandSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryBrandSearchResult" },
            },
          },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryBrandsResult" },
            },
          },
          {
            name: "cellar",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryCellarResult" },
            },
          },
          {
            name: "cellarItemSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryCellarItemSearchResult" },
            },
          },
          {
            name: "cellarSearchElsewhere",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "UNION",
                name: "QueryCellarSearchElsewhereResult",
              },
            },
          },
          {
            name: "duplicatePlaces",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryDuplicatePlacesResult" },
            },
          },
          {
            name: "file",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryFileResult" },
            },
          },
          {
            name: "friendInvitePreview",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryFriendInvitePreviewResult" },
            },
          },
          {
            name: "friendProfile",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryFriendProfileResult" },
            },
          },
          {
            name: "friendTasteAgreements",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "UNION",
                name: "QueryFriendTasteAgreementsResult",
              },
            },
          },
          {
            name: "genericItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryGenericItemResult" },
            },
          },
          { name: "geocode", type: { kind: "OBJECT", name: "GeocodeResult" } },
          {
            name: "googlePlaceDetails",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "GooglePlaceDetailsPayload" },
            },
          },
          {
            name: "googlePlaceSuggestions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "GooglePlacesPayload" },
            },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryItemResult" },
            },
          },
          {
            name: "itemOnboarding",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryItemOnboardingResult" },
            },
          },
          {
            name: "itemSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryItemSearchResult" },
            },
          },
          {
            name: "lovedRecipes",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryLovedRecipesResult" },
            },
          },
          {
            name: "mapBrowse",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMapBrowseResult" },
            },
          },
          { name: "me", type: { kind: "OBJECT", name: "Viewer" } },
          {
            name: "menuScan",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMenuScanResult" },
            },
          },
          {
            name: "myCellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyCellarsResult" },
            },
          },
          {
            name: "myDiscoveries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyDiscoveriesResult" },
            },
          },
          {
            name: "myFriendRequests",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyFriendRequestsResult" },
            },
          },
          {
            name: "myFriends",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyFriendsResult" },
            },
          },
          {
            name: "myMenuScans",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyMenuScansResult" },
            },
          },
          {
            name: "myPlaceInteraction",
            type: { kind: "UNION", name: "QueryMyPlaceInteractionResult" },
          },
          {
            name: "myPlaceInteractions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyPlaceInteractionsResult" },
            },
          },
          {
            name: "myRecipes",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyRecipesResult" },
            },
          },
          {
            name: "myTierLists",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryMyTierListsResult" },
            },
          },
          {
            name: "ping",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Pong" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryPlaceResult" },
            },
          },
          {
            name: "placeSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryPlaceSearchResult" },
            },
          },
          {
            name: "rankings",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryRankingsResult" },
            },
          },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryRecipeResult" },
            },
          },
          {
            name: "recipeGroup",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryRecipeGroupResult" },
            },
          },
          {
            name: "recipeGroups",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryRecipeGroupsResult" },
            },
          },
          {
            name: "recipePhotoJob",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryRecipePhotoJobResult" },
            },
          },
          {
            name: "recipeSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryRecipeSearchResult" },
            },
          },
          {
            name: "referenceData",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryReferenceDataResult" },
            },
          },
          {
            name: "reverseGeocode",
            type: { kind: "OBJECT", name: "ReverseGeocodeResult" },
          },
          {
            name: "sharedItem",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QuerySharedItemResult" },
            },
          },
          {
            name: "sharedRecipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QuerySharedRecipeResult" },
            },
          },
          {
            name: "sharedTierList",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QuerySharedTierListResult" },
            },
          },
          {
            name: "tasteAgreement",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryTasteAgreementResult" },
            },
          },
          {
            name: "tasteProfile",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryTasteProfileResult" },
            },
          },
          {
            name: "tierList",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryTierListResult" },
            },
          },
          {
            name: "user",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryUserResult" },
            },
          },
          {
            name: "userSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryUserSearchResult" },
            },
          },
          {
            name: "whatCanIMake",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "UNION", name: "QueryWhatCanIMakeResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "QueryBarPantryResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BarPantry" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryBarcodeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "Barcode" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "Brand" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryBrandSearchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BrandSearchConnection" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryBrandsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BrandConnection" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryCellarItemSearchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarItemSearchConnection" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryCellarResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "Cellar" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryCellarSearchElsewhereResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarSearchElsewhereConnection" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryDuplicatePlacesResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "DuplicatePlaceConnection" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryFileResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "File" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryFriendInvitePreviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendInvitePreview" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryFriendProfileResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendProfile" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryFriendTasteAgreementsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "QueryFriendTasteAgreementsSuccess" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "QueryFriendTasteAgreementsSuccess",
        fields: [
          {
            name: "data",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TasteAgreement" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "QueryGenericItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "GenericItem" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryItemOnboardingResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemOnboarding" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "QueryItemSuccess" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryItemSearchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemSearchConnection" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "QueryItemSuccess",
        fields: [
          {
            name: "data",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "QueryLovedRecipesResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMapBrowseResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MapEntryConnection" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMenuScanResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MenuScan" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyCellarsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarConnection" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyDiscoveriesResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MatchSuggestionConnection" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyFriendRequestsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendRequestConnection" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyFriendsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendConnection" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyMenuScansResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MenuScanConnection" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyPlaceInteractionResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "PlaceInteraction" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyPlaceInteractionsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "PlaceInteractionConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyRecipesResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryMyTierListsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierListConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryPlaceResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Place" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryPlaceSearchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "PlaceSearchConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryRankingsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RankingsConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryRecipeGroupResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeGroup" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryRecipeGroupsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeGroupConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryRecipePhotoJobResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipePhotoJob" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryRecipeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Recipe" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryRecipeSearchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeSearchConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryReferenceDataResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ReferenceRowConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QuerySharedItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "SharedItem" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QuerySharedRecipeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "SharedRecipe" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QuerySharedTierListResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "SharedTierList" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryTasteAgreementResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TasteAgreement" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryTasteProfileResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TasteProfile" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryTierListResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierList" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryUserResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "UserProfile" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryUserSearchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "UserSearchConnection" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "QueryWhatCanIMakeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
          { kind: "OBJECT", name: "WhatCanIMake" },
        ],
      },
      {
        kind: "OBJECT",
        name: "RankingEntry",
        fields: [
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "reviewCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RankingsConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RankingsEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RankingsEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RankingEntry" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Recipe",
        fields: [
          { name: "canonicalRecipeId", type: { kind: "SCALAR", name: "ID" } },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "createdBy", type: { kind: "OBJECT", name: "UserProfile" } },
          { name: "createdById", type: { kind: "SCALAR", name: "ID" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          { name: "difficultyLevel", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "downvotes",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "imageUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "ingredientCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "ingredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          {
            name: "instructionCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "instructions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeInstructionConnection" },
            },
          },
          {
            name: "isDraft",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isLoved",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "makeability",
            type: { kind: "OBJECT", name: "RecipeMakeability" },
          },
          { name: "myVote", type: { kind: "ENUM", name: "RecipeVoteType" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "netScore",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "prepTimeMinutes", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "privacy",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PermissionType" },
            },
          },
          {
            name: "recipeGroup",
            type: { kind: "OBJECT", name: "RecipeGroup" },
          },
          { name: "recipeGroupId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeReviewConnection" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeScore" },
            },
          },
          { name: "servingSize", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "RecipeType" },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "upvotes",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "version",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeGroup",
        fields: [
          { name: "baseSpirit", type: { kind: "SCALAR", name: "String" } },
          { name: "canonicalRecipe", type: { kind: "OBJECT", name: "Recipe" } },
          { name: "canonicalRecipeId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "category",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "RecipeCategory" },
            },
          },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "createdById", type: { kind: "SCALAR", name: "ID" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "imageUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipeCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "recipes",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeConnection" },
            },
          },
          {
            name: "tags",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "votes",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeVoteConnection" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeGroupConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeGroupEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeGroupEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeGroup" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeIngredient",
        fields: [
          {
            name: "amount",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "availability",
            type: { kind: "OBJECT", name: "IngredientAvailability" },
          },
          { name: "brandMentioned", type: { kind: "SCALAR", name: "String" } },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "genericItem",
            type: { kind: "OBJECT", name: "GenericItem" },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "isOptional",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          { name: "kind", type: { kind: "ENUM", name: "IngredientKind" } },
          { name: "kindLabel", type: { kind: "SCALAR", name: "String" } },
          { name: "quantity", type: { kind: "SCALAR", name: "Float" } },
          { name: "quantityText", type: { kind: "SCALAR", name: "String" } },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "refType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "RecipeIngredientType" },
            },
          },
          { name: "role", type: { kind: "ENUM", name: "IngredientRole" } },
          {
            name: "substitutionNotes",
            type: { kind: "SCALAR", name: "String" },
          },
          { name: "unit", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeIngredientConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeIngredientEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeIngredientEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredient" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeIngredientsPayload",
        fields: [
          {
            name: "ingredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeInstruction",
        fields: [
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "equipmentNeeded", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "instructionText",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "instructionType",
            type: { kind: "ENUM", name: "InstructionType" },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "stepNumber",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "timeMinutes", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeInstructionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeInstructionEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeInstructionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeInstruction" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeInstructionsPayload",
        fields: [
          {
            name: "instructions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeInstructionConnection" },
            },
          },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeMakeability",
        fields: [
          {
            name: "haveCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "missing",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "String" },
                },
              },
            },
          },
          {
            name: "missingKinds",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "ENUM", name: "IngredientKind" },
                },
              },
            },
          },
          {
            name: "requiredCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "MakeabilityStatus" },
            },
          },
          {
            name: "substituteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipePhotoJob",
        fields: [
          {
            name: "attempts",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "cancelRequested",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "finishedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "lastError", type: { kind: "SCALAR", name: "String" } },
          {
            name: "processed",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "progress",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipePhotoProgress" },
            },
          },
          { name: "startedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "status",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "JobStatus" },
            },
          },
          { name: "total", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipePhotoProgress",
        fields: [
          {
            name: "done",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "jobId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "recipeGroupId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "stage",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "RecipePhotoStage" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeReview",
        fields: [
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "score", type: { kind: "SCALAR", name: "Float" } },
          { name: "text", type: { kind: "SCALAR", name: "String" } },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "user", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeReviewConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeReviewEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeReviewEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeReview" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeScore",
        fields: [
          { name: "average", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeSearchResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeSearchResult",
        fields: [
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          { name: "distance", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
          { name: "recipeGroupId", type: { kind: "SCALAR", name: "ID" } },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeVote",
        fields: [
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "voteType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "RecipeVoteType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeVoteConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "RecipeVoteEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeVoteEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeVote" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RecipeVotePayload",
        fields: [
          {
            name: "canonicalChanged",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "group",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeGroup" },
            },
          },
          {
            name: "netScore",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "vote",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeVote" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "RecordPlaceAccessResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecordedPlaceAccess" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "RecordPlaceInteractionResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "PlaceInteraction" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "RecordedPlaceAccess",
        fields: [
          {
            name: "accessCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "lastAccessedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "place",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Place" },
            },
          },
          {
            name: "placeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "RedoTierListEditResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierListHistoryStep" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "ReferenceRow",
        fields: [
          { name: "comment", type: { kind: "SCALAR", name: "String" } },
          {
            name: "value",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ReferenceRowConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "ReferenceRowEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ReferenceRowEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ReferenceRow" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RejectFriendRequestPayload",
        fields: [
          {
            name: "deleted",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "requestId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "RejectFriendRequestResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RejectFriendRequestPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "RemoveFriendPayload",
        fields: [
          {
            name: "removed",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "RemoveFriendResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RemoveFriendPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "RemoveItemFromCellarResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RemovedCellarItem" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "RemoveRecipeVoteResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RemovedRecipeVote" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "RemoveTierListItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RemovedTierListItem" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "RemovedCellarItem",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RemovedRecipeVote",
        fields: [
          {
            name: "canonicalChanged",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "RemovedTierListItem",
        fields: [
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ReorderBandPayload",
        fields: [
          {
            name: "band",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "items",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "ReorderTierListBandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ReorderBandPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "ReplaceItemBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemBrand" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "RereadItemLabelResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemLabelReading" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "ResetFriendInviteResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendInvite" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "ResolveBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "Brand" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "RestoreDrinkLogResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RestoredDrinkLogPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "RestoredDrinkLogPayload",
        fields: [
          {
            name: "entry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckIn" },
            },
          },
          {
            name: "ids",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "ResubmitPlaceResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Place" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "ReverseGeocodeResult",
        fields: [
          { name: "countryCode", type: { kind: "SCALAR", name: "String" } },
          { name: "locality", type: { kind: "SCALAR", name: "String" } },
          { name: "postcode", type: { kind: "SCALAR", name: "String" } },
          { name: "region", type: { kind: "SCALAR", name: "String" } },
          { name: "streetAddress", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Sake",
        fields: [
          { name: "acidity", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "alcoholContentPercentage",
            type: { kind: "SCALAR", name: "Float" },
          },
          { name: "aminoAcid", type: { kind: "SCALAR", name: "Float" } },
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          { name: "category", type: { kind: "SCALAR", name: "String" } },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "polishGrade", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          { name: "region", type: { kind: "SCALAR", name: "String" } },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          { name: "riceVariety", type: { kind: "SCALAR", name: "String" } },
          { name: "sakeMeterValue", type: { kind: "SCALAR", name: "Float" } },
          { name: "sakeType", type: { kind: "SCALAR", name: "String" } },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "servingTemperature",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "vintageYear", type: { kind: "SCALAR", name: "Int" } },
          { name: "yeastStrain", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Item" }],
      },
      {
        kind: "UNION",
        name: "SendFriendRequestResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "FriendRequest" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SetBarPantryItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BarPantryEntry" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SetBrandParentResult",
        possibleTypes: [
          { kind: "OBJECT", name: "Brand" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SetCellarItemPercentageResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarItem" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SetDrinkLogCompanionsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemCheckIn" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "SetFavoritePayload",
        fields: [
          {
            name: "changed",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "favorited",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "item",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "INTERFACE", name: "Item" },
            },
          },
          {
            name: "itemId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "SetFavoriteResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "SetFavoritePayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SetRecipeIngredientsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeIngredientsPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SetRecipeInstructionsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeInstructionsPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "SetRecipeLovePayload",
        fields: [
          {
            name: "changed",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "loved",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "recipe",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "Recipe" },
            },
          },
          {
            name: "recipeId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "SetRecipeLoveResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "SetRecipeLovePayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "SetWantToTryPayload",
        fields: [
          {
            name: "changed",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          {
            name: "key",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "WantToTryKind" },
            },
          },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          { name: "recipe", type: { kind: "OBJECT", name: "Recipe" } },
          {
            name: "wantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "SetWantToTryResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "SetWantToTryPayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "SharedItem",
        fields: [
          {
            name: "attributes",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "JSON" },
            },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "imagePlaceholder",
            type: { kind: "SCALAR", name: "String" },
          },
          { name: "imageUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "scoreAverage", type: { kind: "SCALAR", name: "Float" } },
          {
            name: "scoreCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipe",
        fields: [
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          { name: "difficultyLevel", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "imageUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "ingredients",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "OBJECT",
                name: "SharedRecipeIngredientConnection",
              },
            },
          },
          {
            name: "instructions",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "OBJECT",
                name: "SharedRecipeInstructionConnection",
              },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "prepTimeMinutes", type: { kind: "SCALAR", name: "Int" } },
          { name: "servingSize", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "RecipeType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipeIngredient",
        fields: [
          {
            name: "isOptional",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "name", type: { kind: "SCALAR", name: "String" } },
          { name: "quantity", type: { kind: "SCALAR", name: "Float" } },
          { name: "unit", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipeIngredientConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: {
                    kind: "OBJECT",
                    name: "SharedRecipeIngredientEdge",
                  },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipeIngredientEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "SharedRecipeIngredient" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipeInstruction",
        fields: [
          {
            name: "stepNumber",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "text",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipeInstructionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: {
                    kind: "OBJECT",
                    name: "SharedRecipeInstructionEdge",
                  },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedRecipeInstructionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "SharedRecipeInstruction" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedTierList",
        fields: [
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "entries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "SharedTierListEntryConnection" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "listType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "ownerDisplayName",
            type: { kind: "SCALAR", name: "String" },
          },
          {
            name: "privacy",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PermissionType" },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedTierListEntry",
        fields: [
          {
            name: "band",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "entryId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "entryType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListEntryType" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "imageUrl", type: { kind: "SCALAR", name: "String" } },
          { name: "location", type: { kind: "SCALAR", name: "String" } },
          { name: "name", type: { kind: "SCALAR", name: "String" } },
          { name: "notes", type: { kind: "SCALAR", name: "String" } },
          {
            name: "position",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedTierListEntryConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "SharedTierListEntryEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "SharedTierListEntryEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "SharedTierListEntry" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Spirit",
        fields: [
          {
            name: "alcoholContentPercentage",
            type: { kind: "SCALAR", name: "Float" },
          },
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "spiritType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "style", type: { kind: "SCALAR", name: "String" } },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "vintage", type: { kind: "SCALAR", name: "Date" } },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Item" }],
      },
      {
        kind: "UNION",
        name: "StartItemOnboardingResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemOnboarding" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "StartRecipePhotoJobResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipePhotoJob" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "StartRecipeTextJobResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipePhotoJob" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SuggestFlavourTagsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "FlavourTagSuggestionsPayload" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SuggestItemDetailsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemDetailSuggestions" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "SuggestNewItemDetailsResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemDetailSuggestions" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "TasteAgreement",
        fields: [
          { name: "agreed", type: { kind: "SCALAR", name: "Int" } },
          { name: "avatarUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "byType",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TasteAgreementByType" },
                },
              },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "shared",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TasteAgreementByType",
        fields: [
          { name: "agreed", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "shared",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TasteArchetype",
        fields: [
          {
            name: "key",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TasteArchetypeKey" },
            },
          },
          {
            name: "lessKeen",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TasteStyle" },
                },
              },
            },
          },
          {
            name: "loves",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TasteStyle" },
                },
              },
            },
          },
          {
            name: "title",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TasteProfile",
        fields: [
          {
            name: "archetype",
            type: { kind: "OBJECT", name: "TasteArchetype" },
          },
          {
            name: "line",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "linePhrasedByAi",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "ratingCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "types",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TasteTypeCount" },
                },
              },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TasteStyle",
        fields: [
          {
            name: "average",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Float" },
            },
          },
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "label",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TasteTypeCount",
        fields: [
          {
            name: "count",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "itemType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Tea",
        fields: [
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          { name: "caffeineLevel", type: { kind: "SCALAR", name: "String" } },
          { name: "category", type: { kind: "SCALAR", name: "String" } },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "cultivar", type: { kind: "SCALAR", name: "String" } },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "flavorProfile", type: { kind: "SCALAR", name: "String" } },
          { name: "form", type: { kind: "SCALAR", name: "String" } },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          { name: "harvestYear", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          { name: "ingredients", type: { kind: "SCALAR", name: "String" } },
          { name: "isFairTrade", type: { kind: "SCALAR", name: "Boolean" } },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          { name: "isOrganic", type: { kind: "SCALAR", name: "Boolean" } },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "oxidationLevel", type: { kind: "SCALAR", name: "String" } },
          { name: "processing", type: { kind: "SCALAR", name: "String" } },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          { name: "region", type: { kind: "SCALAR", name: "String" } },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "steepingTemperature",
            type: { kind: "SCALAR", name: "String" },
          },
          { name: "steepingTime", type: { kind: "SCALAR", name: "String" } },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Item" }],
      },
      {
        kind: "OBJECT",
        name: "TierList",
        fields: [
          {
            name: "addSuggestions",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListSuggestionConnection" },
            },
          },
          { name: "aiInsights", type: { kind: "SCALAR", name: "JSON" } },
          {
            name: "contentUpdatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "createdBy", type: { kind: "OBJECT", name: "UserProfile" } },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "editHistory",
            type: { kind: "OBJECT", name: "TierListEditHistory" },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "insightsFailureReason",
            type: { kind: "ENUM", name: "ActorErrorReason" },
          },
          {
            name: "insightsGeneratedAt",
            type: { kind: "SCALAR", name: "DateTime" },
          },
          {
            name: "insightsRetryAt",
            type: { kind: "SCALAR", name: "DateTime" },
          },
          {
            name: "insightsStatus",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListInsightsStatus" },
            },
          },
          {
            name: "itemCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "items",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "listType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "privacy",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "PermissionType" },
            },
          },
          {
            name: "tryNext",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListTryNextConnection" },
            },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TierListEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierList" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListEdit",
        fields: [
          {
            name: "at",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "entryCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "entryId", type: { kind: "SCALAR", name: "ID" } },
          { name: "entryName", type: { kind: "SCALAR", name: "String" } },
          {
            name: "entryType",
            type: { kind: "ENUM", name: "TierListEntryType" },
          },
          { name: "fromBand", type: { kind: "SCALAR", name: "Int" } },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListEditKind" },
            },
          },
          {
            name: "seq",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "toBand", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListEditHistory",
        fields: [
          {
            name: "canRedo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "canUndo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "editCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "redo", type: { kind: "OBJECT", name: "TierListEdit" } },
          { name: "undo", type: { kind: "OBJECT", name: "TierListEdit" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListHistoryStep",
        fields: [
          {
            name: "applied",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListEdit" },
            },
          },
          {
            name: "history",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListEditHistory" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListItem",
        fields: [
          {
            name: "band",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "createdAt", type: { kind: "SCALAR", name: "DateTime" } },
          {
            name: "entryType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListEntryType" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          { name: "notes", type: { kind: "SCALAR", name: "String" } },
          { name: "ownerReview", type: { kind: "OBJECT", name: "ItemReview" } },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          {
            name: "position",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          { name: "tierList", type: { kind: "OBJECT", name: "TierList" } },
          {
            name: "tierListId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "updatedAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListItemConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TierListItemEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListItemEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItem" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListSuggestion",
        fields: [
          { name: "bottleCount", type: { kind: "SCALAR", name: "Int" } },
          { name: "cellarName", type: { kind: "SCALAR", name: "String" } },
          {
            name: "entryType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListEntryType" },
            },
          },
          { name: "friend", type: { kind: "OBJECT", name: "UserProfile" } },
          { name: "friendBand", type: { kind: "SCALAR", name: "Int" } },
          { name: "friendCount", type: { kind: "SCALAR", name: "Int" } },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          { name: "lastTastedAt", type: { kind: "SCALAR", name: "DateTime" } },
          { name: "logCount", type: { kind: "SCALAR", name: "Int" } },
          { name: "myScore", type: { kind: "SCALAR", name: "Float" } },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          {
            name: "section",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListSuggestionSection" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListSuggestionConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TierListSuggestionEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListSuggestionEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListSuggestion" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListTemplate",
        fields: [
          {
            name: "entryType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListEntryType" },
            },
          },
          {
            name: "listType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "ratedCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListTemplateConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TierListTemplateEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListTemplateEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListTemplate" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListTryNext",
        fields: [
          {
            name: "entryType",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListEntryType" },
            },
          },
          { name: "friend", type: { kind: "OBJECT", name: "UserProfile" } },
          { name: "friendBand", type: { kind: "SCALAR", name: "Int" } },
          { name: "friendCount", type: { kind: "SCALAR", name: "Int" } },
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          { name: "likeBand", type: { kind: "SCALAR", name: "Int" } },
          { name: "likeName", type: { kind: "SCALAR", name: "String" } },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          {
            name: "reason",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "TierListTryNextReason" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListTryNextConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "TierListTryNextEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "TierListTryNextEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListTryNext" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "UndoTierListEditResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierListHistoryStep" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UnlinkItemBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "UnlinkedItemBrand" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "UnlinkedItemBrand",
        fields: [
          {
            name: "brandId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "UpdateBrandResult",
        possibleTypes: [
          { kind: "OBJECT", name: "Brand" },
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateCellarItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "CellarItem" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateCellarResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "Cellar" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateDrinkLogResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemCheckIn" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateGenericItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "GenericItem" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateItemResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "MutationUpdateItemSuccess" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateItemReviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "ItemReview" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateProfileResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "UserProfile" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateRecipeGroupResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeGroup" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateRecipeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "Recipe" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateRecipeReviewResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeReview" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "UpdateTierListResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "TierList" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "UploadTarget",
        fields: [
          {
            name: "bucket",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "expiresAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "fileId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "key",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "uploadUrl",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "UserProfile",
        fields: [
          { name: "avatarUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "displayName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "email", type: { kind: "SCALAR", name: "String" } },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "locale", type: { kind: "SCALAR", name: "String" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "UserProfileConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "UserProfileEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "UserProfileEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfile" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "UserSearchConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "UserSearchEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "UserSearchEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserSearchResult" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "UserSearchResult",
        fields: [
          { name: "avatarUrl", type: { kind: "SCALAR", name: "String" } },
          {
            name: "displayName",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "relation", type: { kind: "ENUM", name: "PersonRelation" } },
          {
            name: "userId",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ValidationError",
        fields: [
          {
            name: "code",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ActorErrorCode" },
            },
          },
          {
            name: "message",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          { name: "reason", type: { kind: "ENUM", name: "ActorErrorReason" } },
          { name: "retryAt", type: { kind: "SCALAR", name: "DateTime" } },
        ],
        interfaces: [
          { kind: "INTERFACE", name: "ActorError" },
          { kind: "INTERFACE", name: "Error" },
        ],
      },
      {
        kind: "UNION",
        name: "VerifyMenuItemMatchResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "PlaceMenuItem" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "UNION",
        name: "VerifyUploadResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "File" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "Viewer",
        fields: [
          {
            name: "aiCapabilities",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "AiCapabilities" },
            },
          },
          {
            name: "aiJobs",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "AiJobConnection" },
            },
          },
          {
            name: "bottleSearch",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BottleSearchConnection" },
            },
          },
          {
            name: "collectionStats",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CollectionStats" },
            },
          },
          {
            name: "counts",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ViewerCounts" },
            },
          },
          {
            name: "drinkSoon",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "DrinkSoonConnection" },
            },
          },
          { name: "email", type: { kind: "SCALAR", name: "String" } },
          {
            name: "emailVerified",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "favorites",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemConnection" },
            },
          },
          {
            name: "friendInvite",
            type: { kind: "OBJECT", name: "FriendInvite" },
          },
          {
            name: "friendsFeed",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ActivityEntryConnection" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "nearbyPlaces",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "NearbyPlaceConnection" },
            },
          },
          {
            name: "openBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          {
            name: "profile",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "UserProfile" },
            },
          },
          {
            name: "recentActivity",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ActivityEntryConnection" },
            },
          },
          {
            name: "role",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ViewerRole" },
            },
          },
          {
            name: "tierListTemplates",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListTemplateConnection" },
            },
          },
          {
            name: "wantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "WantToTryConnection" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "ViewerCounts",
        fields: [
          {
            name: "bottles",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "logs",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "places",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "tierLists",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "UNION",
        name: "VoteOnRecipeResult",
        possibleTypes: [
          { kind: "OBJECT", name: "BudgetExceededError" },
          { kind: "OBJECT", name: "ConflictError" },
          { kind: "OBJECT", name: "ForbiddenError" },
          { kind: "OBJECT", name: "NotFoundError" },
          { kind: "OBJECT", name: "RecipeVotePayload" },
          { kind: "OBJECT", name: "ValidationError" },
        ],
      },
      {
        kind: "OBJECT",
        name: "WantToTryConnection",
        fields: [
          {
            name: "edges",
            type: {
              kind: "NON_NULL",
              ofType: {
                kind: "LIST",
                ofType: {
                  kind: "NON_NULL",
                  ofType: { kind: "OBJECT", name: "WantToTryEdge" },
                },
              },
            },
          },
          {
            name: "pageInfo",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "PageInfo" },
            },
          },
          { name: "totalCount", type: { kind: "SCALAR", name: "Int" } },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "WantToTryEdge",
        fields: [
          {
            name: "cursor",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "node",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "WantToTryEntry" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "WantToTryEntry",
        fields: [
          { name: "item", type: { kind: "INTERFACE", name: "Item" } },
          {
            name: "key",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "kind",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "WantToTryKind" },
            },
          },
          { name: "place", type: { kind: "OBJECT", name: "Place" } },
          { name: "recipe", type: { kind: "OBJECT", name: "Recipe" } },
          {
            name: "savedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "WhatCanIMake",
        fields: [
          {
            name: "bottleCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "makeNow",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BarRecipeMatchConnection" },
            },
          },
          {
            name: "makeNowCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "oneBottleAway",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "BarRecipeMatchConnection" },
            },
          },
          {
            name: "oneBottleAwayCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "pantryCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "scanned",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
        ],
        interfaces: [],
      },
      {
        kind: "OBJECT",
        name: "Wine",
        fields: [
          {
            name: "alcoholContentPercentage",
            type: { kind: "SCALAR", name: "Float" },
          },
          { name: "barcode", type: { kind: "SCALAR", name: "String" } },
          {
            name: "brands",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemBrandConnection" },
            },
          },
          {
            name: "cellars",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarConnection" },
            },
          },
          {
            name: "checkIns",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemCheckInConnection" },
            },
          },
          {
            name: "cocktails",
            type: { kind: "OBJECT", name: "ItemCocktails" },
          },
          {
            name: "correction",
            type: { kind: "OBJECT", name: "ItemCorrection" },
          },
          { name: "country", type: { kind: "SCALAR", name: "String" } },
          {
            name: "createdAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          {
            name: "createdById",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          { name: "description", type: { kind: "SCALAR", name: "String" } },
          {
            name: "favoriteCount",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Int" } },
          },
          {
            name: "friendsScore",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "id",
            type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } },
          },
          {
            name: "images",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemImageConnection" },
            },
          },
          {
            name: "isFavorite",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "isWantToTry",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "Boolean" },
            },
          },
          {
            name: "myBottles",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "CellarItemConnection" },
            },
          },
          { name: "myReview", type: { kind: "OBJECT", name: "ItemReview" } },
          {
            name: "name",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "String" },
            },
          },
          {
            name: "recipeIngredients",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "RecipeIngredientConnection" },
            },
          },
          { name: "region", type: { kind: "SCALAR", name: "String" } },
          {
            name: "reviews",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemReviewConnection" },
            },
          },
          {
            name: "score",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "ItemScore" },
            },
          },
          {
            name: "specialDesignation",
            type: { kind: "SCALAR", name: "String" },
          },
          { name: "style", type: { kind: "SCALAR", name: "String" } },
          {
            name: "tierListEntries",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "OBJECT", name: "TierListItemConnection" },
            },
          },
          {
            name: "type",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "ENUM", name: "ItemType" },
            },
          },
          {
            name: "updatedAt",
            type: {
              kind: "NON_NULL",
              ofType: { kind: "SCALAR", name: "DateTime" },
            },
          },
          { name: "variety", type: { kind: "SCALAR", name: "String" } },
          {
            name: "vineyardDesignation",
            type: { kind: "SCALAR", name: "String" },
          },
          { name: "vintage", type: { kind: "SCALAR", name: "Date" } },
        ],
        interfaces: [{ kind: "INTERFACE", name: "Item" }],
      },
    ],
  },
};
