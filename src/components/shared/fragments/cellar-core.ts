import { graphql } from "@cellar-assistant/shared";

/**
 * Core cellar fields for basic identification and display
 */
export const CellarCoreFragment = graphql(`
  fragment CellarCore on cellars {
    id
    name
    created_by_id
    created_at
    updated_at
  }
`);

/**
 * Cellar owner and co-owner information
 */
export const CellarOwnersFragment = graphql(`
  fragment CellarOwners on cellars {
    created_by {
      id
      displayName
      avatarUrl
    }
    co_owners {
      user {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

/**
 * Cellar item counts by type
 * Useful for dashboard and overview displays
 */
export const CellarItemCountsFragment = graphql(`
  fragment CellarItemCounts on cellars {
    items_aggregate(distinct_on: [beer_id, wine_id, spirit_id, coffee_id, sake_id]) {
      wines: aggregate(where: { wine_id: { _is_null: false } }) {
        count
      }
      beers: aggregate(where: { beer_id: { _is_null: false } }) {
        count
      }
      spirits: aggregate(where: { spirit_id: { _is_null: false } }) {
        count
      }
      coffees: aggregate(where: { coffee_id: { _is_null: false } }) {
        count
      }
      sakes: aggregate(where: { sake_id: { _is_null: false } }) {
        count
      }
    }
  }
`);

/**
 * User permissions for the cellar
 * Requires $userId variable to check permissions
 */
export const CellarPermissionsFragment = graphql(`
  fragment CellarPermissions on cellars {
    created_by_id
    co_owners(where: { user_id: { _eq: $userId } }) {
      id
      user_id
    }
  }
`);

/**
 * Full cellar data combining all fragments
 * Use this for detailed cellar views
 */
export const CellarFullFragment = graphql(
  `
  fragment CellarFull on cellars {
    ...CellarCore
    ...CellarOwners
    ...CellarItemCounts
    ...CellarPermissions
  }
`,
  [
    CellarCoreFragment,
    CellarOwnersFragment,
    CellarItemCountsFragment,
    CellarPermissionsFragment,
  ],
);
