/**
 * The recipe editor's documents (X15). Each write is its own document: the
 * API allows one model-backed field per document (`services/api/src/
 * limits.ts`), and `createRecipe`, `updateRecipe` and `setRecipeIngredients`
 * each enqueue an embedding — so a save is three requests in order, not one.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** Everything the editor needs to open a recipe, and who is asking. */
export const RecipeEditQuery = graphql(
  `
  query RecipeEdit($recipeId: ID!) {
    me {
      id
    }
    recipe(id: $recipeId) {
      __typename
      ... on Recipe {
        id
        name
        type
        description
        privacy
        isDraft
        createdBy {
          id
        }
        ingredients(first: 100) {
          pageInfo {
            hasNextPage
          }
          edges {
            node {
              id
              quantity
              unit
              quantityText
              amount
              isOptional
              substitutionNotes
              role
              kind
              kindLabel
              brandMentioned
              item {
                __typename
                id
                name
                type
              }
              genericItem {
                id
                name
                category
                kind
              }
            }
          }
        }
        instructions(first: 100) {
          pageInfo {
            hasNextPage
          }
          edges {
            node {
              id
              instructionText
              instructionType
              equipmentNeeded
              timeMinutes
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

export const CreateRecipeMutation = graphql(
  `
  mutation CreateRecipeFromEditor($input: CreateRecipeInput!) {
    createRecipe(input: $input) {
      __typename
      ... on Recipe {
        id
        name
        privacy
        isDraft
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const UpdateRecipeMutation = graphql(
  `
  mutation UpdateRecipeFromEditor($recipeId: ID!, $input: UpdateRecipeInput!) {
    updateRecipe(recipeId: $recipeId, input: $input) {
      __typename
      ... on Recipe {
        id
        name
        type
        description
        privacy
        isDraft
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SetRecipeIngredientsMutation = graphql(
  `
  mutation SetRecipeIngredientsFromEditor(
    $recipeId: ID!
    $ingredients: [RecipeIngredientInput!]!
  ) {
    setRecipeIngredients(recipeId: $recipeId, ingredients: $ingredients) {
      __typename
      ... on RecipeIngredientsPayload {
        recipeId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SetRecipeInstructionsMutation = graphql(
  `
  mutation SetRecipeInstructionsFromEditor(
    $recipeId: ID!
    $instructions: [RecipeInstructionInput!]!
  ) {
    setRecipeInstructions(recipeId: $recipeId, instructions: $instructions) {
      __typename
      ... on RecipeInstructionsPayload {
        recipeId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const DeleteRecipeMutation = graphql(
  `
  mutation DeleteRecipeFromEditor($recipeId: ID!) {
    deleteRecipe(recipeId: $recipeId) {
      __typename
      ... on DeletedRecipe {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** X15's Paste: the same job as a photo, reading text. */
export const StartRecipeTextJobMutation = graphql(
  `
  mutation StartRecipeTextJob($input: StartRecipeTextJobInput!, $jobId: ID) {
    startRecipeTextJob(input: $input, jobId: $jobId) {
      __typename
      ... on RecipePhotoJob {
        id
        status
        attempts
        lastError
        progress {
          jobId
          stage
          done
          recipeId
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Your drafts and your recipes, for the Bar page. */
export const MY_RECIPES_PAGE_SIZE = 20;

export const MyRecipesQuery = graphql(
  `
  query MyRecipes($first: Int!, $drafts: Boolean) {
    myRecipes(first: $first, drafts: $drafts) {
      __typename
      ... on RecipeConnection {
        totalCount
        edges {
          node {
            id
            name
            type
            privacy
            isDraft
            ingredientCount
            updatedAt
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Whether a stopped or failed reading left a draft behind (X15). The job
 * writes the recipe row before its ingredients and method, so a Stop or a
 * failure after that stage leaves a partial draft — the composer says so
 * rather than "Nothing was saved".
 */
export const RecipeLeftoverQuery = graphql(
  `
  query RecipeLeftover($recipeId: ID!) {
    recipe(id: $recipeId) {
      __typename
      ... on Recipe {
        id
        isDraft
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
