import * as fs from "node:fs";
import * as path from "node:path";
import type {
  FetchPlacesBatchOptions,
  PlaceBatchResult,
  PlaceData,
  PlaceDataService,
} from "./_types";
import { BIGQUERY_BATCH_SIZE } from "./_types";

interface WisconsinPlace {
  overture_id: string;
  name: string;
  primary_category: string;
  alternate_categories?: {
    list: Array<{ element: string }>;
  };
  confidence: number;
  latitude: number;
  longitude: number;
  addresses?: {
    list: Array<{
      element: {
        freeform?: string;
        locality?: string;
        postcode?: string;
        region?: string;
        country?: string;
      };
    }>;
  };
  phone_list?: Array<{ element: string }>;
  websites?: {
    list: Array<{ element: string }>;
  };
}

export class MockPlaceDataService implements PlaceDataService {
  private wisconsinPlaces: PlaceData[] = [];

  constructor() {
    this.loadWisconsinData();
  }

  private loadWisconsinData(): void {
    try {
      const filePath = path.join(__dirname, "wisconsin-places.json");
      const rawData = fs.readFileSync(filePath, "utf8");
      const wisconsinData: WisconsinPlace[] = JSON.parse(rawData);

      this.wisconsinPlaces = wisconsinData.map((place) =>
        this.transformWisconsinPlace(place),
      );

      // Sort by overture_id for consistent keyset pagination
      this.wisconsinPlaces.sort((a, b) =>
        a.overture_id.localeCompare(b.overture_id),
      );

      console.log(
        `[MockPlaceDataService] Loaded ${this.wisconsinPlaces.length} Wisconsin places`,
      );
    } catch (error) {
      console.warn(
        "[MockPlaceDataService] Failed to load Wisconsin data, falling back to hardcoded data:",
        error,
      );
      this.wisconsinPlaces = this.getFallbackPlaces();
    }
  }

  private transformWisconsinPlace(place: WisconsinPlace): PlaceData {
    const alternateCategories =
      place.alternate_categories?.list?.map((cat) => cat.element) ?? [];
    const firstAddress = place.addresses?.list?.[0]?.element;

    return {
      overture_id: place.overture_id,
      name: place.name,
      primary_category: place.primary_category,
      categories:
        alternateCategories.length > 0
          ? alternateCategories
          : [place.primary_category],
      confidence: place.confidence,
      latitude: place.latitude,
      longitude: place.longitude,
      address_freeform: firstAddress?.freeform ?? null,
      address_locality: firstAddress?.locality ?? null,
      address_region: firstAddress?.region ?? null,
      address_postcode: firstAddress?.postcode ?? null,
      address_country: firstAddress?.country ?? null,
      phone: place.phone_list?.[0]?.element ?? null,
      website: place.websites?.list?.[0]?.element ?? null,
      brand_name: null,
    };
  }

  private getFallbackPlaces(): PlaceData[] {
    return [
      {
        overture_id: "fallback_restaurant_001",
        name: "Wisconsin Fallback Restaurant",
        primary_category: "restaurant",
        categories: ["restaurant", "bar"],
        confidence: 0.85,
        latitude: 44.5,
        longitude: -89.5,
        address_freeform: "Somewhere in Wisconsin",
        phone: null,
        website: null,
        brand_name: null,
      },
    ];
  }

  async fetchPlacesBatch(
    options: FetchPlacesBatchOptions = {},
  ): Promise<PlaceBatchResult> {
    const { cursor, limit = BIGQUERY_BATCH_SIZE } = options;

    await new Promise((resolve) => setTimeout(resolve, 100));

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = this.wisconsinPlaces.findIndex(
        (p) => p.overture_id === cursor,
      );
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const batch = this.wisconsinPlaces.slice(startIndex, startIndex + limit);
    const lastId =
      batch.length > 0 ? batch[batch.length - 1].overture_id : null;
    const hasMore = startIndex + limit < this.wisconsinPlaces.length;

    console.log(
      `[MockPlaceDataService] Returning ${batch.length} places, hasMore=${hasMore}`,
    );

    return { places: batch, lastId, hasMore };
  }

  getName(): string {
    return "MockPlaceDataService";
  }
}
