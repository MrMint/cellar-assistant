export interface PlaceData {
  overture_id: string;
  name: string;
  common_names?: string[];
  primary_category: string;
  categories: string[];
  confidence: number;
  latitude: number;
  longitude: number;
  address?: any;
  phone?: string;
  website?: string;
  brand_name?: string;
}

export interface PlaceDataService {
  /**
   * Fetch places data from the configured data source
   * @param categories - Array of category names to filter by
   * @returns Promise resolving to array of place data
   */
  fetchPlaces(categories: string[]): Promise<PlaceData[]>;

  /**
   * Get the name of this service (for logging)
   */
  getName(): string;
}
