import { graphql } from "@shared/gql";

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

export const addItemReview = graphql(`
  mutation AddItemReview($review: item_reviews_insert_input!) {
    insert_item_reviews_one(object: $review) {
      id
      beer {
        id
      }
      wine {
        id
      }
      spirit {
        id
      }
    }
  }
`);

export const addCheckIn = graphql(`
  mutation AddCheckIn($checkIn: check_ins_insert_input!) {
    insert_check_ins_one(object: $checkIn) {
      id
      cellar_item {
        id
      }
    }
  }
`);

export const addCheckIns = graphql(`
  mutation AddCheckIns($checkIns: [check_ins_insert_input!]!) {
    insert_check_ins(objects: $checkIns) {
      affected_rows
      returning {
        id
        cellar_item {
          id
        }
      }
    }
  }
`);

export const getSearchVectorQuery = graphql(`
  query GetSearchVectorQuery($text: String, $image: String) {
    create_search_vector(text: $text, image: $image)
  }
`);
