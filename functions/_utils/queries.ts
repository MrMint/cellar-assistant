import { graphql } from "../_gql/gql.js";

export const getCredential = graphql(`
  query GetCredential($id: String!) {
    admin_credentials_by_pk(id: $id) {
      id
      credentials
    }
  }
`);
