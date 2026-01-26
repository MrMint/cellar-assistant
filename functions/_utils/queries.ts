import { graphql } from "@cellar-assistant/shared/";

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
