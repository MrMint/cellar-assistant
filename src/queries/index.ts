import { graphql } from "@/gql";

export const addItemImageMutation = graphql(`
  mutation AddItemImage($input: item_image_upload_input!) {
    item_image_upload(input: $input) {
      id
    }
  }
`);

export const addBeerToCellarMutation = graphql(`
  mutation AddBeerToCellar($beer: cellar_beer_insert_input!) {
    insert_cellar_beer_one(object: $beer) {
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

export const addWineMutation = graphql(`
  mutation AddWine($wine: wines_insert_input!) {
    insert_wines_one(object: $wine) {
      id
    }
  }
`);

export const addWineToCellarMutation = graphql(`
  mutation AddWineToCellar($input: cellar_wine_insert_input!) {
    insert_cellar_wine_one(object: $input) {
      id
      cellar_id
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

export const addSpiritToCellarMutation = graphql(`
  mutation AddSpiritToCellar($spirit: cellar_spirit_insert_input!) {
    insert_cellar_spirit_one(object: $spirit) {
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
