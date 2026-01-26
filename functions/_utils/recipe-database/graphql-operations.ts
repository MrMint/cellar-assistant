/**
 * Typed GraphQL Operations for Recipe Database
 *
 * All GraphQL queries and mutations used by the recipe database modules,
 * defined with proper type safety using gql.tada.
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// Brand Management Operations
// =============================================================================

export const FindBrandQuery = graphql(`
  query FindBrand($name: String!) {
    brands(where: { name: { _ilike: $name } }, limit: 1) {
      id
      name
      brand_type
    }
  }
`);

export const CreateBrandMutation = graphql(`
  mutation CreateBrand(
    $name: String!
    $brand_type: brand_types_enum
    $description: String
  ) {
    insert_brands_one(object: {
      name: $name
      brand_type: $brand_type
      description: $description
    }) {
      id
      name
    }
  }
`);

export const LinkItemToBrandMutation = graphql(`
  mutation LinkItemToBrand(
    $wine_id: uuid
    $beer_id: uuid
    $spirit_id: uuid
    $coffee_id: uuid
    $brand_id: uuid!
    $is_primary: Boolean
  ) {
    insert_item_brands_one(object: {
      wine_id: $wine_id
      beer_id: $beer_id
      spirit_id: $spirit_id
      coffee_id: $coffee_id
      brand_id: $brand_id
      is_primary: $is_primary
    }) {
      id
    }
  }
`);

// =============================================================================
// Item Creation Operations
// =============================================================================

export const InsertWineMutation = graphql(`
  mutation InsertWine(
    $name: String!
    $style: wine_style_enum
    $vintage: date
    $alcohol_content_percentage: numeric
    $description: String
    $region: String
    $variety: wine_variety_enum
    $special_designation: String
    $vineyard_designation: String
    $country: country_enum
  ) {
    insert_wines_one(object: {
      name: $name
      style: $style
      vintage: $vintage
      alcohol_content_percentage: $alcohol_content_percentage
      description: $description
      region: $region
      variety: $variety
      special_designation: $special_designation
      vineyard_designation: $vineyard_designation
      country: $country
    }) {
      id
      name
    }
  }
`);

export const InsertBeerMutation = graphql(`
  mutation InsertBeer(
    $name: String!
    $style: beer_style_enum
    $alcohol_content_percentage: numeric
    $description: String
    $country: country_enum
    $vintage: date
    $international_bitterness_unit: Int
  ) {
    insert_beers_one(object: {
      name: $name
      style: $style
      alcohol_content_percentage: $alcohol_content_percentage
      description: $description
      country: $country
      vintage: $vintage
      international_bitterness_unit: $international_bitterness_unit
    }) {
      id
      name
    }
  }
`);

export const InsertSpiritMutation = graphql(`
  mutation InsertSpirit(
    $name: String!
    $type: spirit_type_enum!
    $alcohol_content_percentage: numeric
    $description: String
    $country: country_enum
    $vintage: date
    $style: String
  ) {
    insert_spirits_one(object: {
      name: $name
      type: $type
      alcohol_content_percentage: $alcohol_content_percentage
      description: $description
      country: $country
      vintage: $vintage
      style: $style
    }) {
      id
      name
    }
  }
`);

export const InsertCoffeeMutation = graphql(`
  mutation InsertCoffee(
    $name: String!
    $description: String!
    $country: country_enum
    $roast_level: coffee_roast_level_enum
    $process: coffee_process_enum
    $species: coffee_species_enum
    $cultivar: coffee_cultivar_enum
  ) {
    insert_coffees_one(object: {
      name: $name
      description: $description
      country: $country
      roast_level: $roast_level
      process: $process
      species: $species
      cultivar: $cultivar
    }) {
      id
      name
    }
  }
`);

export const FindExistingGenericItemQuery = graphql(`
  query FindExistingGenericItem($name: String!, $category: String!) {
    generic_items(
      where: {
        name: { _ilike: $name }
        category: { _ilike: $category }
      }
      limit: 1
    ) {
      id
      name
      category
    }
  }
`);

export const CreateGenericItemMutation = graphql(`
  mutation CreateGenericItem(
    $name: String!
    $category: String!
    $subcategory: String
    $item_type: String!
    $description: String
    $is_substitutable: Boolean
  ) {
    insert_generic_items_one(
      object: {
        name: $name
        category: $category
        subcategory: $subcategory
        item_type: $item_type
        description: $description
        is_substitutable: $is_substitutable
      }
      on_conflict: {
        constraint: idx_generic_items_name_category
        update_columns: [description, is_substitutable, item_type]
      }
    ) {
      id
      name
    }
  }
`);

// =============================================================================
// Recipe Creation Operations
// =============================================================================

export const CreateRecipeMutation = graphql(`
  mutation CreateRecipe(
    $name: String!
    $description: String
    $type: String!
    $difficulty_level: Int
    $prep_time_minutes: Int
    $serving_size: Int
    $image_url: String
  ) {
    insert_recipes_one(object: {
      name: $name
      description: $description
      type: $type
      difficulty_level: $difficulty_level
      prep_time_minutes: $prep_time_minutes
      serving_size: $serving_size
      image_url: $image_url
    }) {
      id
    }
  }
`);

export const CreateRecipeInstructionsMutation = graphql(`
  mutation CreateRecipeInstructions($objects: [recipe_instructions_insert_input!]!) {
    insert_recipe_instructions(objects: $objects) {
      affected_rows
    }
  }
`);

// =============================================================================
// Ingredient Processing Operations
// =============================================================================

export const CreateRecipeIngredientMutation = graphql(`
  mutation CreateRecipeIngredient(
    $recipe_id: uuid!
    $wine_id: uuid
    $beer_id: uuid
    $spirit_id: uuid
    $coffee_id: uuid
    $generic_item_id: uuid
    $quantity: numeric
    $unit: String
    $is_optional: Boolean
    $substitution_notes: String
  ) {
    insert_recipe_ingredients_one(object: {
      recipe_id: $recipe_id
      wine_id: $wine_id
      beer_id: $beer_id
      spirit_id: $spirit_id
      coffee_id: $coffee_id
      generic_item_id: $generic_item_id
      quantity: $quantity
      unit: $unit
      is_optional: $is_optional
      substitution_notes: $substitution_notes
    }) {
      id
    }
  }
`);
