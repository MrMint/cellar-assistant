import { graphql } from "../_gql";

export const addItemImage = graphql(`
  mutation AddItemImage($item: item_image_insert_input!) {
    insert_item_image_one(object: $item) {
      id
    }
  }
`);
