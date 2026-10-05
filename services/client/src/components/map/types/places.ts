/**
 * `82450ad1:src/types/places.ts`, restored beside the map types (its only
 * readers are here).
 *
 * `PlaceGooglePhoto.storageFileId` (an Nhost storage id fed to
 * `getNhostStorageUrl`) → `url`, the presigned `PlacePhoto.file.url` (D10:
 * drawn with a plain `<img>`, never through `/_next/image`), plus the photo's
 * own `attributions`, which Google's terms require next to the image.
 * `PlaceEnrichment.photoReferences` is gone: the API mirrors the photos and
 * exposes them as `Place.photos`.
 */

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
  attributions: unknown[];
}

export interface PlaceGooglePhoto {
  id: string;
  /** Presigned GET; null when the bytes were never mirrored. */
  url: string | null;
  displayOrder: number;
  attributions: unknown[];
}
