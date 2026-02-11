import { graphql } from "@cellar-assistant/shared";

/**
 * Core tier list fields for list views
 */
export const TierListCoreFragment = graphql(`
  fragment TierListCore on tier_lists @_unmask {
    id
    name
    description
    created_by_id
    privacy
    list_type
    ai_insights
    insights_generated_at
    content_updated_at
    created_at
    updated_at
  }
`);

/**
 * Tier list card for index page grid
 * Includes creator info and item count
 */
export const TierListCardFragment = graphql(`
  fragment TierListCard on tier_lists @_unmask {
    id
    name
    description
    privacy
    list_type
    created_at
    createdBy {
      id
      displayName
      avatarUrl
    }
    items_aggregate {
      aggregate {
        count
      }
    }
  }
`);

/**
 * Individual tier list item with polymorphic entity data
 * Place fields are inlined to avoid fragment masking issues
 * user_place_interactions is filtered by Hasura permissions (no $userId needed)
 * Item review scores are fetched separately server-side
 */
export const TierListItemFragment = graphql(`
  fragment TierListItem on tier_list_items @_unmask {
    id
    tier_list_id
    band
    position
    notes
    type
    created_at
    updated_at
    place {
      id
      name
      display_name
      primary_category
      categories
      locality
      region
      country_code
      user_place_interactions {
        rating
      }
    }
    wine {
      id
      name
      vintage
      variety
      country
      region
    }
    beer {
      id
      name
      style
    }
    spirit {
      id
      name
      type
    }
    coffee {
      id
      name
      country
    }
    sake {
      id
      name
      category
      region
    }
  }
`);

/**
 * Full tier list with all items ordered by band (desc) then position (asc)
 */
export const TierListFullFragment = graphql(
  `
    fragment TierListFull on tier_lists @_unmask {
      ...TierListCore
      createdBy {
        id
        displayName
        avatarUrl
      }
      items(order_by: [{ band: desc }, { position: asc }]) {
        ...TierListItem
      }
    }
  `,
  [TierListCoreFragment, TierListItemFragment],
);

/**
 * Edit fragment for tier list form initialization
 */
export const TierListEditFragment = graphql(`
  fragment TierListEdit on tier_lists @_unmask {
    id
    name
    description
    privacy
    list_type
    created_by_id
  }
`);
