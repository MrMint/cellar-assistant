import * as fs from "node:fs";
import * as path from "node:path";
import type { PlaceData, PlaceDataService } from "./_types";

// Wisconsin places data structure from the JSON file
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

      // Transform Wisconsin data to our PlaceData format
      this.wisconsinPlaces = wisconsinData.map((place) =>
        this.transformWisconsinPlace(place),
      );

      console.log(
        `[MockPlaceDataService] Loaded ${this.wisconsinPlaces.length} Wisconsin places`,
      );
    } catch (error) {
      console.warn(
        "[MockPlaceDataService] Failed to load Wisconsin data, falling back to hardcoded data:",
        error,
      );
      // Fallback to a few hardcoded places if file loading fails
      this.wisconsinPlaces = this.getFallbackPlaces();
    }
  }

  private transformWisconsinPlace(place: WisconsinPlace): PlaceData {
    // Extract alternate categories
    const alternateCategories =
      place.alternate_categories?.list?.map((cat) => cat.element) || [];

    // Extract address - use first address if available
    const firstAddress = place.addresses?.list?.[0]?.element;
    const address = firstAddress
      ? {
          freeform: firstAddress.freeform,
          locality: firstAddress.locality,
          postcode: firstAddress.postcode,
          region: firstAddress.region,
          country: firstAddress.country,
        }
      : null;

    // Extract phone - use first phone if available
    const phone = place.phone_list?.[0]?.element || null;

    // Extract website - use first website if available
    const website = place.websites?.list?.[0]?.element || null;

    return {
      overture_id: place.overture_id,
      name: place.name,
      common_names: null, // Wisconsin data doesn't seem to have common_names
      primary_category: place.primary_category,
      categories:
        alternateCategories.length > 0
          ? alternateCategories
          : [place.primary_category],
      confidence: place.confidence,
      latitude: place.latitude,
      longitude: place.longitude,
      address,
      phone,
      website,
      brand_name: null, // Wisconsin data doesn't seem to have brand_name
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
        address: { freeform: "Somewhere in Wisconsin" },
        phone: null,
        website: null,
        brand_name: null,
      },
    ];
  }

  async fetchPlaces(categories: string[]): Promise<PlaceData[]> {
    console.log(
      `[MockPlaceDataService] Fetching Wisconsin data for categories: ${categories.join(", ")}`,
    );

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Filter Wisconsin places by categories if specified
    if (categories.length > 0) {
      const filteredPlaces = this.wisconsinPlaces.filter(
        (place) =>
          categories.includes(place.primary_category) ||
          place.categories.some((cat: string) => categories.includes(cat)),
      );

      console.log(
        `[MockPlaceDataService] Returning ${filteredPlaces.length} filtered Wisconsin places`,
      );
      return filteredPlaces;
    }

    console.log(
      `[MockPlaceDataService] Returning all ${this.wisconsinPlaces.length} Wisconsin places`,
    );
    return this.wisconsinPlaces;
  }

  getName(): string {
    return "MockPlaceDataService";
  }
}
