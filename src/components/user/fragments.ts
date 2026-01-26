import { graphql } from "@cellar-assistant/shared";

/**
 * User edit fragment for form initialization
 * Includes only fields needed for editing user profile
 */
export const UserEditFragment = graphql(`
  fragment UserEdit on users @_unmask {
    id
    displayName
    email
    avatarUrl
  }
`);

/**
 * Query to get user edit data for a specific user
 * Used for form initialization in edit pages
 */
export const GetUserEditQuery = graphql(
  `
  query GetUserEdit($userId: uuid!) {
    users_by_pk(id: $userId) {
      ...UserEdit
    }
  }
`,
  [UserEditFragment],
);
