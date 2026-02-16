/** Shared types for Google Places enrichment data, used across server and client. */

export interface PlaceEnrichment {
  googlePlaceId: string;
  name: string;
  formattedAddress: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  priceLevel: number | null;
  website: string | null;
  phone: string | null;
  openingHours: unknown;
  types: string[];
  businessStatus: string | null;
  editorialSummary: string | null;
  photoReferences: unknown[];
  attributions: unknown[];
}

export interface PlaceGooglePhoto {
  id: string;
  storageFileId: string;
  displayOrder: number;
}
