import { graphql } from "@cellar-assistant/shared";
import {
  BrandCoreFragment,
  BrandFullFragment,
  RecipeCoreFragment,
  RecipeFullFragment,
} from "@/components/shared/fragments";

/**
 * Example query to get all recipes with basic info
 * Use with RecipeCard component
 */
export const GetRecipesQuery = graphql(
  `
  query GetRecipes($limit: Int = 20, $offset: Int = 0) {
    recipes(limit: $limit, offset: $offset, order_by: { created_at: desc }) {
      ...RecipeCore
    }
    recipes_aggregate {
      aggregate {
        count
      }
    }
  }
`,
  [RecipeCoreFragment],
);

/**
 * Example query to get a single recipe with full details
 * Use with RecipeDetails component
 */
export const GetRecipeQuery = graphql(
  `
  query GetRecipe($id: uuid!) {
    recipes_by_pk(id: $id) {
      ...RecipeFull
    }
  }
`,
  [RecipeFullFragment],
);

/**
 * Example query to get all brands with basic info
 * Use with BrandCard component
 */
export const GetBrandsQuery = graphql(
  `
  query GetBrands($limit: Int = 20, $offset: Int = 0) {
    brands(limit: $limit, offset: $offset, order_by: { name: asc }) {
      ...BrandCore
      item_brands_aggregate {
        aggregate {
          count
        }
      }
      place_brands_aggregate {
        aggregate {
          count
        }
      }
    }
    brands_aggregate {
      aggregate {
        count
      }
    }
  }
`,
  [BrandCoreFragment],
);

/**
 * Example query to get a single brand with full details
 * Use with BrandDetails component
 */
export const GetBrandQuery = graphql(
  `
  query GetBrand($id: uuid!) {
    brands_by_pk(id: $id) {
      ...BrandFull
    }
  }
`,
  [BrandFullFragment],
);

/**
 * Example query to get recipes using a specific item
 * Use to show recipes in item detail pages
 */
export const GetRecipesByWineQuery = graphql(
  `
  query GetRecipesByWine($wineId: uuid!) {
    recipe_ingredients(where: { wine_id: { _eq: $wineId } }) {
      id
      quantity
      unit
      is_optional
      recipe {
        id
        name
        type
        image_url
        difficulty_level
      }
    }
  }
`,
);

/**
 * Example query to search for recipes containing specific ingredients
 * Use for recipe search and discovery features
 */
export const SearchRecipesQuery = graphql(
  `
  query SearchRecipes($searchTerm: String!, $limit: Int = 10) {
    recipes(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { description: { _ilike: $searchTerm } }
          { recipe_ingredients: { 
            _or: [
              { wine: { name: { _ilike: $searchTerm } } }
              { beer: { name: { _ilike: $searchTerm } } }
              { spirit: { name: { _ilike: $searchTerm } } }
              { coffee: { name: { _ilike: $searchTerm } } }
              { generic_item: { name: { _ilike: $searchTerm } } }
            ]
          } }
        ]
      }
      limit: $limit
      order_by: { name: asc }
    ) {
      ...RecipeCore
    }
  }
`,
  [RecipeCoreFragment],
);
