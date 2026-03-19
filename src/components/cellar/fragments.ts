import { graphql } from "@cellar-assistant/shared";

/**
 * Core cellar fields for list views
 * Includes basic information and ownership details
 */
export const CellarCardFragment = graphql(`
  fragment CellarCard on cellars @_unmask {
    id
    name
    createdBy {
      id
      displayName
      avatarUrl
    }
    coOwners: co_owners {
      user {
        id
        displayName
        avatarUrl
      }
    }
    item_counts: items_aggregate(where: { empty_at: { _is_null: true } }) {
      beers: aggregate {
        count(columns: [beer_id])
      }
      wines: aggregate {
        count(columns: [wine_id])
      }
      spirits: aggregate {
        count(columns: [spirit_id])
      }
      coffees: aggregate {
        count(columns: [coffee_id])
      }
      sakes: aggregate {
        count(columns: [sake_id])
      }
    }
  }
`);

/**
 * Query to get all cellars for list view
 * Uses the card fragment for consistent data requirements
 */
export const GetCellarsQuery = graphql(
  `
  query GetCellars {
    cellars {
      ...CellarCard
    }
  }
`,
  [CellarCardFragment],
);

/**
 * Basic cellar information for item list pages
 * Includes ownership and item counts for context
 */
export const CellarInfoFragment = graphql(`
  fragment CellarInfo on cellars @_unmask {
    id
    name
    created_by_id
    co_owners {
      user_id
    }
    item_counts: items_aggregate(where: { empty_at: { _is_null: true } }) {
      beers: aggregate {
        count(columns: [beer_id])
      }
      wines: aggregate {
        count(columns: [wine_id])
      }
      spirits: aggregate {
        count(columns: [spirit_id])
      }
      coffees: aggregate {
        count(columns: [coffee_id])
      }
      sakes: aggregate {
        count(columns: [sake_id])
      }
    }
  }
`);

/**
 * Query to get basic cellar information for server-side rendering
 * This provides the foundation data that client components can build upon
 */
export const GetCellarInfoQuery = graphql(
  `
  query GetCellarInfo($cellarId: uuid!) {
    cellars_by_pk(id: $cellarId) {
      ...CellarInfo
    }
  }
`,
  [CellarInfoFragment],
);

/**
 * Cellar edit fragment for form initialization
 * Includes only fields needed for editing cellar details
 */
export const CellarEditFragment = graphql(`
  fragment CellarEdit on cellars @_unmask {
    id
    name
    created_by_id
  }
`);

/**
 * Query to get cellar edit data for a specific cellar
 * Used for form initialization in edit pages
 */
export const GetCellarEditQuery = graphql(
  `
  query GetCellarEdit($cellarId: uuid!) {
    cellars_by_pk(id: $cellarId) {
      ...CellarEdit
    }
  }
`,
  [CellarEditFragment],
);
