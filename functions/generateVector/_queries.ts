import { graphql } from "@shared/gql";

export const insertVectorMutation = graphql(`
  mutation InsertVector($vector: item_vectors_insert_input!) {
    insert_item_vectors_one(object: $vector) {
      id
    }
  }
`);

export const deleteOldVectorsMutation = graphql(`
  mutation DeleteVectors($where: item_vectors_bool_exp!) {
    delete_item_vectors(where: $where) {
      affected_rows
    }
  }
`);
