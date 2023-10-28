import { graphql } from "../_gql";

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
