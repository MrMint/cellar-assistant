/**
 * TypeScript interfaces for Google Places API (New) responses.
 * Based on: https://developers.google.com/maps/documentation/places/web-service/reference/rest
 */

// =============================================================================
// Common Types
// =============================================================================

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface LocalizedText {
  text: string;
  languageCode: string;
}

export interface AuthorAttribution {
  displayName: string;
  uri: string;
  photoUri: string;
}

// =============================================================================
// Place Photo
// =============================================================================

export interface GooglePlacePhoto {
  name: string; // Resource name, e.g. "places/ChIJ.../photos/AelY..."
  widthPx: number;
  heightPx: number;
  authorAttributions: AuthorAttribution[];
  flagContentUri?: string;
  googleMapsUri?: string;
}

// =============================================================================
// Opening Hours
// =============================================================================

export interface GoogleOpeningHours {
  openNow?: boolean;
  periods?: GoogleOpeningPeriod[];
  weekdayDescriptions?: string[];
}

export interface GoogleOpeningPeriod {
  open: GoogleOpeningPoint;
  close?: GoogleOpeningPoint;
}

export interface GoogleOpeningPoint {
  day: number; // 0=Sunday, 6=Saturday
  hour: number;
  minute: number;
}

// =============================================================================
// Place Details Response
// =============================================================================

export interface GooglePlaceDetails {
  id: string; // Google Place ID
  displayName?: LocalizedText;
  formattedAddress?: string;
  location?: LatLng;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string; // PRICE_LEVEL_FREE, PRICE_LEVEL_INEXPENSIVE, etc.
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: GoogleOpeningHours;
  currentOpeningHours?: GoogleOpeningHours;
  businessStatus?: string; // OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
  editorialSummary?: LocalizedText;
  photos?: GooglePlacePhoto[];
  attributions?: AuthorAttribution[];
  googleMapsUri?: string;
}

// =============================================================================
// Nearby Search
// =============================================================================

export interface NearbySearchRequest {
  includedTypes?: string[];
  excludedTypes?: string[];
  locationRestriction: {
    circle: {
      center: LatLng;
      radius: number; // meters
    };
  };
  maxResultCount?: number;
  languageCode?: string;
}

export interface NearbySearchResponse {
  places?: GooglePlaceDetails[];
}

// =============================================================================
// Autocomplete
// =============================================================================

export interface AutocompleteRequest {
  input: string;
  locationBias?: {
    circle: {
      center: LatLng;
      radius: number;
    };
  };
  includedPrimaryTypes?: string[];
  languageCode?: string;
}

export interface AutocompleteSuggestion {
  placePrediction?: {
    place: string; // Resource name "places/{place_id}"
    placeId: string;
    text: LocalizedText;
    structuredFormat?: {
      mainText: LocalizedText;
      secondaryText: LocalizedText;
    };
    types?: string[];
  };
}

export interface AutocompleteResponse {
  suggestions?: AutocompleteSuggestion[];
}

// =============================================================================
// Text Search
// =============================================================================

export interface TextSearchRequest {
  textQuery: string;
  locationBias?: {
    circle: {
      center: LatLng;
      radius: number;
    };
  };
  includedType?: string;
  maxResultCount?: number;
  languageCode?: string;
}

export interface TextSearchResponse {
  places?: GooglePlaceDetails[];
}

// =============================================================================
// App-Level Types (what we return to callers)
// =============================================================================

export interface NearbyPlaceSuggestion {
  googlePlaceId: string;
  name: string;
  address: string;
  types: string[];
  location: LatLng;
}

export interface AutocompletePlaceSuggestion {
  googlePlaceId: string;
  name: string;
  secondaryText: string;
  types: string[];
}

export interface PlaceEnrichmentData {
  googlePlaceId: string;
  name: string;
  formattedAddress: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  priceLevel: number | null;
  website: string | null;
  phone: string | null;
  openingHours: GoogleOpeningHours | null;
  types: string[];
  businessStatus: string | null;
  editorialSummary: string | null;
  photoReferences: GooglePlacePhoto[];
  attributions: AuthorAttribution[];
}

// =============================================================================
// Cost Constants (in tenths of a cent for precision)
// =============================================================================

export const API_COSTS_TENTHS_CENT = {
  autocomplete: 3, // $0.00283 = 0.3 cents = 3 tenths (Essentials)
  nearby_search: 32, // $0.032 = 3.2 cents = 32 tenths (Pro)
  text_search: 32, // $0.032 = 3.2 cents = 32 tenths (Pro)
  place_details: 25, // $0.025 = 2.5 cents = 25 tenths (Enterprise+Atmosphere)
  photo: 7, // $0.007 = 0.7 cents = 7 tenths
} as const;

// Budget costs in whole cents (rounded up for safety)
export const API_COSTS_CENTS = {
  autocomplete: 1,
  nearby_search: 4,
  text_search: 4,
  place_details: 3,
  photo: 1,
} as const;
