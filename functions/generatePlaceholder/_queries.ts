import { graphql } from "@shared/gql";

export const updateItemImageMutation = graphql(`
  mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {
    update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {
      id
    }
  }
`);
