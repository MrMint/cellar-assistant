import type { ResultOf } from "@cellar-assistant/shared";
import { graphql } from "@cellar-assistant/shared/gql";
import type { PlaceEnrichment, PlaceGooglePhoto } from "@/types/places";

export const GET_PLACE_ENRICHMENT = graphql(`
  query GetPlaceEnrichment($placeId: uuid!) {
    places_by_pk(id: $placeId) {
      id
      google_enrichment {
        google_place_id
        google_name
        google_formatted_address
        google_rating
        google_user_ratings_total
        google_price_level
        google_website
        google_phone
        google_opening_hours
        google_types
        google_business_status
        google_editorial_summary
        photo_references
        attributions
        details_fetched_at
        photos_fetched_at
      }
      google_photos(order_by: { display_order: asc }) {
        id
        storage_file_id
        display_order
      }
    }
  }
`);

type EnrichmentQueryResult = ResultOf<typeof GET_PLACE_ENRICHMENT>;
type DbEnrichment = NonNullable<
  NonNullable<EnrichmentQueryResult["places_by_pk"]>["google_enrichment"]
>;
type DbPhotos = NonNullable<
  EnrichmentQueryResult["places_by_pk"]
>["google_photos"];

/** Maps DB enrichment (snake_case) to the camelCase PlaceEnrichment interface. */
export function transformDbEnrichment(
  dbEnrichment: DbEnrichment | null | undefined,
): PlaceEnrichment | null {
  if (!dbEnrichment) return null;
  return {
    googlePlaceId: dbEnrichment.google_place_id,
    name: dbEnrichment.google_name ?? "",
    formattedAddress: dbEnrichment.google_formatted_address ?? null,
    rating: dbEnrichment.google_rating ?? null,
    userRatingsTotal: dbEnrichment.google_user_ratings_total ?? null,
    priceLevel: dbEnrichment.google_price_level ?? null,
    website: dbEnrichment.google_website ?? null,
    phone: dbEnrichment.google_phone ?? null,
    openingHours: dbEnrichment.google_opening_hours,
    types: dbEnrichment.google_types ?? [],
    businessStatus: dbEnrichment.google_business_status ?? null,
    editorialSummary: dbEnrichment.google_editorial_summary ?? null,
    photoReferences: (dbEnrichment.photo_references as unknown[]) ?? [],
    attributions: (dbEnrichment.attributions as unknown[]) ?? [],
  };
}

/** Maps DB photos (snake_case) to the camelCase PlaceGooglePhoto interface. */
export function transformDbPhotos(
  dbPhotos: DbPhotos | null | undefined,
): PlaceGooglePhoto[] {
  return (dbPhotos ?? []).map((p) => ({
    id: p.id,
    storageFileId: p.storage_file_id ?? "",
    displayOrder: p.display_order,
  }));
}
