import { graphql } from "@cellar-assistant/shared/gql";

export const PlaceCoreFragment = graphql(`
  fragment PlaceCore on places {
    id
    overture_id
    name
    display_name
    primary_category
    categories
    confidence
    location
    street_address
    locality
    region
    postcode
    country_code
    phone
    website
    email
    is_verified
    is_active
    created_at
    updated_at
  }
`);

export const PlaceDetailsFragment = graphql(
  `
  fragment PlaceDetails on places {
    ...PlaceCore
    hours
    price_level
    rating
    review_count
    access_count
    last_accessed_at
    first_cached_reason
    source_tags
    last_sync_at
  }
  `,
  [PlaceCoreFragment],
);

// PlaceMenuItemFragment must be defined before PlaceWithMenuFragment since it's used as a dependency
export const PlaceMenuItemFragment = graphql(`
  fragment PlaceMenuItem on place_menu_items {
    id
    menu_item_name
    menu_item_description
    menu_item_price
    menu_category
    detected_item_type
    confidence_score
    is_available
    created_at
    extracted_attributes
    wine {
      id
      name
      vintage
      variety
    }
    beer {
      id
      name
      style
    }
    spirit {
      id
      name
    }
    coffee {
      id
      name
    }
  }
`);

export const PlaceWithMenuFragment = graphql(
  `
  fragment PlaceWithMenu on places {
    ...PlaceDetails
    user_place_interactions {
      id
      is_favorite
      is_visited
      want_to_visit
      rating
      notes
      tags
      last_visited_at
      visit_count
      created_at
      updated_at
    }
    place_menus(where: { is_current: { _eq: true } }, limit: 1) {
      id
      is_current
      menu_type
      menu_data
      source
      discovered_at
      updated_at
      place_menu_items {
        ...PlaceMenuItem
      }
    }
  }
  `,
  [PlaceDetailsFragment, PlaceMenuItemFragment],
);

export const PlaceWithInteractionFragment = graphql(
  `
  fragment PlaceWithInteraction on places {
    ...PlaceDetails
    user_place_interactions {
      id
      is_favorite
      is_visited
      want_to_visit
      rating
      notes
      tags
      last_visited_at
      visit_count
      created_at
      updated_at
    }
  }
  `,
  [PlaceDetailsFragment],
);

export const MenuScanFragment = graphql(
  `
  fragment MenuScan on menu_scans {
    id
    original_image_id
    processed_image_id
    extracted_text
    processing_status
    processing_error
    confidence_score
    scan_location
    items_detected
    items_matched
    scanned_at
    processed_at
    place {
      ...PlaceCore
    }
    estimated_place {
      ...PlaceCore
    }
  }
  `,
  [PlaceCoreFragment],
);

export const ItemMatchSuggestionFragment = graphql(`
  fragment ItemMatchSuggestion on item_match_suggestions {
    id
    confidence_score
    match_reasoning
    similarity_metrics
    accepted
    rejected
    acted_by
    acted_at
    created_at
    suggested_wine {
      id
      name
      vintage
      variety
    }
    suggested_beer {
      id
      name
      style
    }
    suggested_spirit {
      id
      name
      type
      style
    }
    suggested_coffee {
      id
      name
      country
      roast_level
    }
  }
`);
