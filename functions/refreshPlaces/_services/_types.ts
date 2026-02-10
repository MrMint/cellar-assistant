export interface PlaceData {
  overture_id: string;
  name: string;
  primary_category: string;
  categories: string[];
  confidence: number;
  latitude: number;
  longitude: number;
  address_freeform?: string | null;
  address_locality?: string | null;
  address_region?: string | null;
  address_postcode?: string | null;
  address_country?: string | null;
  phone?: string | null;
  website?: string | null;
  brand_name?: string | null;
}

export interface FetchPlacesBatchOptions {
  cursor?: string;
  limit?: number;
}

export interface PlaceBatchResult {
  places: PlaceData[];
  lastId: string | null;
  hasMore: boolean;
}

export interface PlaceDataService {
  /**
   * Fetch a batch of places with keyset pagination
   */
  fetchPlacesBatch(options: FetchPlacesBatchOptions): Promise<PlaceBatchResult>;

  /**
   * Get the name of this service (for logging)
   */
  getName(): string;
}

/** BigQuery fetch batch size */
export const BIGQUERY_BATCH_SIZE = 5_000;

/** DB upsert batch size */
export const DB_UPSERT_BATCH_SIZE = 500;
