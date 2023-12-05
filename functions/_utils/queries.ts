import { graphql } from "@shared/gql/gql.js";

export const getCredential = graphql(`
  query GetCredential($id: String!) {
    admin_credentials_by_pk(id: $id) {
      id
      credentials
    }
  }
`);

export const getFileQuery = graphql(`
  query GetFile($id: uuid!) {
    file(id: $id) {
      id
      bucket {
        id
      }
      mimeType
      size
    }
  }
`);

export const addTextExtractionResultsMutation = graphql(`
  mutation AddTextExtractionResults($analysis: image_analysis_insert_input!) {
    insert_image_analysis_one(object: $analysis) {
      id
    }
  }
`);
