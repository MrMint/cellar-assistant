import { graphql } from "@cellar-assistant/shared";

/**
 * Core user fields for basic identification and display
 */
export const UserCoreFragment = graphql(`
  fragment UserCore on users {
    id
    displayName
    avatarUrl
    email
    created_at
  }
`);

/**
 * User profile information for detailed views
 */
export const UserProfileFragment = graphql(
  `
  fragment UserProfile on users {
    ...UserCore
    # Add any additional profile fields as they're added to the schema
  }
`,
  [UserCoreFragment],
);

/**
 * User's cellar information
 * Includes owned and co-owned cellars
 */
export const UserCellarsFragment = graphql(`
  fragment UserCellars on users {
    cellars {
      id
      name
      created_at
    }
    co_owned_cellars: cellar_co_owners {
      cellar {
        id
        name
        created_at
      }
    }
  }
`);

/**
 * User's social connections
 * Friends and related social data
 */
export const UserSocialFragment = graphql(`
  fragment UserSocial on users {
    friends {
      friend {
        id
        displayName
        avatarUrl
      }
    }
    friend_requests_sent: friends_aggregate(where: { status: { _eq: "pending" } }) {
      aggregate {
        count
      }
    }
    friend_requests_received: friend_requests_aggregate(where: { status: { _eq: "pending" } }) {
      aggregate {
        count
      }
    }
  }
`);
