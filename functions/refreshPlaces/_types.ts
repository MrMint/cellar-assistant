import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations — Places
// =============================================================================

export const CLEAR_PLACES_MUTATION = graphql(`
  mutation ClearPlaces {
    delete_places(where: {}) {
      affected_rows
    }
  }
`);

export const UPSERT_PLACES_MUTATION = graphql(`
  mutation UpsertPlaces($places: [places_insert_input!]!) {
    insert_places(
      objects: $places
      on_conflict: {
        constraint: places_overture_id_key
        update_columns: [
          name
          display_name
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
          is_active
        ]
      }
    ) {
      affected_rows
    }
  }
`);

// =============================================================================
// GraphQL Operations — Jobs
// =============================================================================

export const CANCEL_ACTIVE_JOBS_MUTATION = graphql(`
  mutation CancelActivePlaceRefreshJobs {
    update_place_refresh_jobs(
      where: { status: { _eq: "processing" } }
      _set: { status: "cancelled", updated_at: "now()" }
    ) {
      affected_rows
    }
  }
`);

export const GET_JOB_STATUS_QUERY = graphql(`
  query GetPlaceRefreshJobStatus($id: uuid!) {
    place_refresh_jobs_by_pk(id: $id) {
      id
      status
    }
  }
`);

export const CREATE_JOB_MUTATION = graphql(`
  mutation CreatePlaceRefreshJob {
    insert_place_refresh_jobs_one(
      object: { status: "processing" }
    ) {
      id
    }
  }
`);

export const UPDATE_JOB_MUTATION = graphql(`
  mutation UpdatePlaceRefreshJob(
    $id: uuid!
    $cursor: String
    $total_inserted: Int!
    $total_batches: Int!
    $status: String!
  ) {
    update_place_refresh_jobs_by_pk(
      pk_columns: { id: $id }
      _set: {
        cursor: $cursor
        total_inserted: $total_inserted
        total_batches: $total_batches
        status: $status
        updated_at: "now()"
      }
    ) {
      id
    }
  }
`);

export const FAIL_JOB_MUTATION = graphql(`
  mutation FailPlaceRefreshJob($id: uuid!, $error_message: String!) {
    update_place_refresh_jobs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "failed"
        error_message: $error_message
        updated_at: "now()"
      }
    ) {
      id
    }
  }
`);

// =============================================================================
// Types
// =============================================================================

export type ClearPlacesResult = ResultOf<typeof CLEAR_PLACES_MUTATION>;
export type UpsertPlacesResult = ResultOf<typeof UPSERT_PLACES_MUTATION>;
export type CreateJobResult = ResultOf<typeof CREATE_JOB_MUTATION>;

export interface PlaceInsertData {
  overture_id: string;
  name: string;
  display_name: string;
  categories: string[];
  confidence: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  street_address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country_code: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  is_active: boolean;
  is_verified: boolean;
  access_count: number;
  first_cached_reason: string;
}

export interface RefreshSuccessResponse {
  success: true;
  job_id: string;
  message: string;
  timestamp: string;
}

export interface RefreshErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

export type RefreshPlacesResponse =
  | RefreshSuccessResponse
  | RefreshErrorResponse;
