import { graphql, type VariablesOf } from "../gql";

export const addItemImageMutation = graphql(`
  mutation AddItemImage($input: item_image_upload_input!) {
    item_image_upload(input: $input) {
      id
    }
  }
`);

export const addCellarItemMutation = graphql(`
  mutation AddCellarItem($item: cellar_items_insert_input!) {
    insert_cellar_items_one(object: $item) {
      id
      cellar_id
    }
  }
`);

export const addBeerMutation = graphql(`
  mutation AddBeer($beer: beers_insert_input!) {
    insert_beers_one(object: $beer) {
      id
    }
  }
`);

export const updateBeerMutation = graphql(`
  mutation UpdateBeer($beerId: uuid!, $beer: beers_set_input!) {
    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {
      id
    }
  }
`);

export const addCoffeeMutation = graphql(`
  mutation AddCoffee($coffee: coffees_insert_input!) {
    insert_coffees_one(object: $coffee) {
      id
    }
  }
`);

export const updateCoffeeMutation = graphql(`
  mutation UpdateCoffee($coffeeId: uuid!, $coffee: coffees_set_input!) {
    update_coffees_by_pk(pk_columns: { id: $coffeeId }, _set: $coffee) {
      id
    }
  }
`);

export const updateCellarItemMutation = graphql(`
  mutation UpdateCellarItem($id: uuid!, $item: cellar_items_set_input!) {
    update_cellar_items_by_pk(pk_columns: { id: $id }, _set: $item) {
      id
      open_at
      empty_at
      percentage_remaining
    }
  }
`);

export const addWineMutation = graphql(`
  mutation AddWine($wine: wines_insert_input!) {
    insert_wines_one(object: $wine) {
      id
    }
  }
`);

export const updateWineMutation = graphql(`
  mutation UpdateWine($wineId: uuid!, $wine: wines_set_input!) {
    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {
      id
    }
  }
`);

export const addSpiritMutation = graphql(`
  mutation AddSpirit($spirit: spirits_insert_input!) {
    insert_spirits_one(object: $spirit) {
      id
    }
  }
`);

export const updateSpiritMutation = graphql(`
  mutation UpdateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {
    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {
      id
    }
  }
`);

export const addSakeMutation = graphql(`
  mutation AddSake($sake: sakes_insert_input!) {
    insert_sakes_one(object: $sake) {
      id
    }
  }
`);

export const updateSakeMutation = graphql(`
  mutation UpdateSake($sakeId: uuid!, $sake: sakes_set_input!) {
    update_sakes_by_pk(pk_columns: { id: $sakeId }, _set: $sake) {
      id
    }
  }
`);

// Note: addItemReview, addCheckIn, addCheckIns, addFavoriteMutation,
// deleteFavoriteMutation mutations moved to server actions

export const getSearchVectorQuery = graphql(`
  query GetSearchVectorQuery($text: String, $image: String) {
    create_search_vector(text: $text, image: $image)
  }
`);

// =============================================================================
// Brand Linking
// =============================================================================

/**
 * Link an item to a brand via the item_brands join table
 * Supports all item types (wine, beer, spirit, coffee, sake)
 * Use on_conflict to update is_primary if relationship already exists
 */
export const linkItemToBrandMutation = graphql(`
  mutation LinkItemToBrand(
    $wine_id: uuid
    $beer_id: uuid
    $spirit_id: uuid
    $coffee_id: uuid
    $sake_id: uuid
    $brand_id: uuid!
    $is_primary: Boolean
  ) {
    insert_item_brands_one(
      object: {
        wine_id: $wine_id
        beer_id: $beer_id
        spirit_id: $spirit_id
        coffee_id: $coffee_id
        sake_id: $sake_id
        brand_id: $brand_id
        is_primary: $is_primary
      }
    ) {
      id
      brand_id
      is_primary
    }
  }
`);

// =============================================================================
// Input Types extracted from mutations using VariablesOf
// =============================================================================

export type Wines_Insert_Input = VariablesOf<typeof addWineMutation>["wine"];
export type Spirits_Insert_Input = VariablesOf<
  typeof addSpiritMutation
>["spirit"];
export type Coffees_Insert_Input = VariablesOf<
  typeof addCoffeeMutation
>["coffee"];
export type Beers_Insert_Input = VariablesOf<typeof addBeerMutation>["beer"];
export type Sakes_Insert_Input = VariablesOf<typeof addSakeMutation>["sake"];
export type Cellar_Items_Insert_Input = VariablesOf<
  typeof addCellarItemMutation
>["item"];

export type Wines_Set_Input = VariablesOf<typeof updateWineMutation>["wine"];
export type Beers_Set_Input = VariablesOf<typeof updateBeerMutation>["beer"];
export type Spirits_Set_Input = VariablesOf<
  typeof updateSpiritMutation
>["spirit"];
export type Coffees_Set_Input = VariablesOf<
  typeof updateCoffeeMutation
>["coffee"];
export type Sakes_Set_Input = VariablesOf<typeof updateSakeMutation>["sake"];
