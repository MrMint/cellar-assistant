import { graphql } from "@cellar-assistant/shared/gql/graphql";

export const insertItemImage = graphql(`
  mutation InsertItemImage($item: item_image_insert_input!) {
    insert_item_image_one(object: $item) {
      id
    }
  }
`);
