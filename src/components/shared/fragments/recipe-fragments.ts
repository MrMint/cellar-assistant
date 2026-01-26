import { graphql } from "@cellar-assistant/shared";

/**
 * Core recipe fields used across multiple components
 * Use this for basic recipe identification and display
 */
export const RecipeCoreFragment = graphql(`
  fragment RecipeCore on recipes {
    id
    name
    description
    type
    difficulty_level
    prep_time_minutes
    serving_size
    image_url
    version
    recipe_group_id
    created_by
    created_at
  }
`);

/**
 * Recipe instructions ordered by step number
 * Use this for displaying recipe steps
 */
export const RecipeInstructionsFragment = graphql(`
  fragment RecipeInstructions on recipes {
    instructions(order_by: { step_number: asc }) {
      id
      step_number
      instruction_text
      instruction_type
      equipment_needed
      time_minutes
    }
  }
`);

/**
 * Recipe ingredients with polymorphic relationships
 * Includes all possible item types and generic items
 */
export const RecipeIngredientsFragment = graphql(`
  fragment RecipeIngredients on recipes {
    ingredients {
      id
      quantity
      unit
      is_optional
      substitution_notes
      wine_id
      beer_id
      spirit_id
      coffee_id
      generic_item_id
      wine {
        id
        name
        vintage
      }
      beer {
        id
        name
      }
      spirit {
        id
        name
      }
      coffee {
        id
        name
      }
      generic_item {
        id
        name
        category
        subcategory
        item_type
      }
    }
  }
`);

/**
 * Recipe group and creator relationships
 * Links to recipe group and user who created the recipe
 */
export const RecipeRelationshipsFragment = graphql(`
  fragment RecipeRelationships on recipes {
    recipe_group_id
    recipe_group {
      id
      name
      category
      base_spirit
    }
    created_by
    created_by_user {
      id
      displayName
      avatarUrl
    }
  }
`);

/**
 * Recipe variation relationships
 * Links to canonical recipe and variations
 */
export const RecipeVariationsFragment = graphql(`
  fragment RecipeVariations on recipes {
    canonical_recipe_id
    canonical_recipe_rel {
      id
      name
      type
    }
    recipe_variations {
      id
      name
      version
      difficulty_level
    }
  }
`);

/**
 * Recipe reviews with user information
 * Use this for displaying recipe reviews
 */
export const RecipeReviewsFragment = graphql(`
  fragment RecipeReviews on recipes {
    recipe_reviews(order_by: { created_at: desc }) {
      id
      score
      text
      created_at
      user {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

/**
 * Full recipe data combining all fragments
 * Use this for detail views and comprehensive displays
 */
export const RecipeFullFragment = graphql(
  `
  fragment RecipeFull on recipes {
    ...RecipeCore
    ...RecipeInstructions
    ...RecipeIngredients
    ...RecipeRelationships
    ...RecipeVariations
    ...RecipeReviews
  }
`,
  [
    RecipeCoreFragment,
    RecipeInstructionsFragment,
    RecipeIngredientsFragment,
    RecipeRelationshipsFragment,
    RecipeVariationsFragment,
    RecipeReviewsFragment,
  ],
);

/**
 * Brand core fields used across multiple components
 * Use this for basic brand identification and display
 */
export const BrandCoreFragment = graphql(`
  fragment BrandCore on brands {
    id
    name
    description
    logo_url
    brand_type
    parent_brand_id
    created_at
  }
`);

/**
 * Brand hierarchy relationships
 * Includes parent and child brands
 */
export const BrandHierarchyFragment = graphql(`
  fragment BrandHierarchy on brands {
    parent_brand {
      id
      name
      brand_type
    }
    child_brands: brands {
      id
      name
      brand_type
    }
  }
`);

/**
 * Brand item relationships across all item types
 * Shows what items are associated with this brand
 */
export const BrandItemsFragment = graphql(`
  fragment BrandItems on brands {
    item_brands {
      id
      is_primary
      wine_id
      beer_id
      spirit_id
      coffee_id
      wine {
        id
        name
        vintage
      }
      beer {
        id
        name
      }
      spirit {
        id
        name
      }
      coffee {
        id
        name
      }
    }
  }
`);

/**
 * Brand place relationships
 * Shows what places are associated with this brand
 */
export const BrandPlacesFragment = graphql(`
  fragment BrandPlaces on brands {
    place_brands {
      id
      relationship_type
      place {
        id
        name
        latitude
        longitude
      }
    }
  }
`);

/**
 * Full brand data combining all fragments
 * Use this for detail views and comprehensive displays
 */
export const BrandFullFragment = graphql(
  `
  fragment BrandFull on brands {
    ...BrandCore
    ...BrandHierarchy
    ...BrandItems
    ...BrandPlaces
  }
`,
  [
    BrandCoreFragment,
    BrandHierarchyFragment,
    BrandItemsFragment,
    BrandPlacesFragment,
  ],
);

/**
 * Generic item fragment for ingredient matching
 * Use this for ingredient templates and AI matching
 */
export const GenericItemFragment = graphql(`
  fragment GenericItem on generic_items {
    id
    name
    category
    subcategory
    item_type
    description
    is_substitutable
  }
`);
