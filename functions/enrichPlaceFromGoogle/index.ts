import type { Request, Response } from "express";
import FormData from "form-data";
import { graphql } from "@cellar-assistant/shared/gql/graphql";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import {
  downloadPhoto,
  getPlaceDetails,
  textSearch,
} from "../_utils/google-places";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";

interface EnrichPlaceBody {
  placeId?: string;
  googlePlaceId?: string;
  triggeredBy?: string;
  maxPhotos?: number;
}

interface PhotoResult {
  id: string;
  storageFileId: string;
  displayOrder: number;
}

function toPhotoResult(p: {
  id: string;
  storage_file_id?: string | null;
  display_order: number;
}): PhotoResult {
  return {
    id: p.id,
    storageFileId: p.storage_file_id ?? "",
    displayOrder: p.display_order,
  };
}

/** Maps DB enrichment row (snake_case) to camelCase response shape. */
function mapDbEnrichment(e: {
  google_place_id: string;
  google_name: string | null;
  google_formatted_address: string | null;
  google_rating: unknown;
  google_user_ratings_total: unknown;
  google_price_level: unknown;
  google_website: string | null;
  google_phone: string | null;
  google_opening_hours: unknown;
  google_types: unknown;
  google_business_status: string | null;
  google_editorial_summary: string | null;
  photo_references: unknown;
  attributions: unknown;
}) {
  return {
    googlePlaceId: e.google_place_id,
    name: e.google_name,
    formattedAddress: e.google_formatted_address,
    rating: e.google_rating,
    userRatingsTotal: e.google_user_ratings_total,
    priceLevel: e.google_price_level,
    website: e.google_website,
    phone: e.google_phone,
    openingHours: e.google_opening_hours,
    types: e.google_types,
    businessStatus: e.google_business_status,
    editorialSummary: e.google_editorial_summary,
    photoReferences: e.photo_references,
    attributions: e.attributions,
  };
}

// =============================================================================
// GraphQL Operations
// =============================================================================

const GET_PLACE = graphql(`
  query GetPlaceForEnrichment($id: uuid!) {
    places_by_pk(id: $id) {
      id
      name
      google_place_id
      location
    }
  }
`);

const GET_ENRICHMENT = graphql(`
  query GetPlaceGoogleEnrichment($placeId: uuid!) {
    place_google_enrichments_by_pk(place_id: $placeId) {
      place_id
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
  }
`);

const UPSERT_ENRICHMENT = graphql(`
  mutation UpsertPlaceGoogleEnrichment(
    $object: place_google_enrichments_insert_input!
  ) {
    insert_place_google_enrichments_one(
      object: $object
      on_conflict: {
        constraint: place_google_enrichments_pkey
        update_columns: [
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
        ]
      }
    ) {
      place_id
    }
  }
`);

const UPDATE_PLACE_GOOGLE_ID = graphql(`
  mutation UpdatePlaceGoogleId($id: uuid!, $googlePlaceId: String!) {
    update_places_by_pk(
      pk_columns: { id: $id }
      _set: { google_place_id: $googlePlaceId }
    ) {
      id
    }
  }
`);

const GET_EXISTING_PHOTOS = graphql(`
  query GetExistingPlaceGooglePhotos($placeId: uuid!) {
    place_google_photos(
      where: { place_id: { _eq: $placeId } }
      order_by: { display_order: asc }
    ) {
      id
      storage_file_id
      display_order
    }
  }
`);

const INSERT_PHOTO = graphql(`
  mutation InsertPlaceGooglePhoto(
    $object: place_google_photos_insert_input!
  ) {
    insert_place_google_photos_one(object: $object) {
      id
      storage_file_id
    }
  }
`);

const UPDATE_PHOTOS_FETCHED = graphql(`
  mutation UpdatePhotosFetchedAt($placeId: uuid!) {
    update_place_google_enrichments_by_pk(
      pk_columns: { place_id: $placeId }
      _set: { photos_fetched_at: "now()" }
    ) {
      place_id
    }
  }
`);

// =============================================================================
// Photo Fetching Helper
// =============================================================================

async function fetchAndStorePhotos(
  placeId: string,
  photoReferences: unknown[],
  maxPhotos: number,
  triggeredBy: string | undefined,
  headers: ReturnType<typeof getAdminAuthHeaders>,
): Promise<PhotoResult[]> {
  // Check if photos already exist
  const existingResult = await functionQuery(
    GET_EXISTING_PHOTOS,
    { placeId },
    { headers },
  );
  const existingPhotos = existingResult.place_google_photos;
  if (existingPhotos.length > 0) {
    return existingPhotos.map(toPhotoResult);
  }

  const photoRefs = photoReferences as Array<{
    name: string;
    widthPx: number;
    heightPx: number;
    authorAttributions?: Array<{
      displayName: string;
      uri: string;
      photoUri: string;
    }>;
  }>;

  if (photoRefs.length === 0) return [];

  const photosToProcess = photoRefs.slice(0, maxPhotos);
  const uploadedPhotos: PhotoResult[] = [];

  const subdomain = process.env.NHOST_SUBDOMAIN;
  const adminSecret = process.env.NHOST_ADMIN_SECRET;

  if (!subdomain || !adminSecret) {
    console.error("[enrichPlaceFromGoogle] Missing storage configuration");
    return [];
  }

  const storageUrl =
    subdomain === "local"
      ? "https://local.storage.nhost.run/v1/files"
      : `https://${subdomain}.storage.${process.env.NHOST_REGION}.nhost.run/v1/files`;

  for (let i = 0; i < photosToProcess.length; i++) {
    const photoRef = photosToProcess[i];

    // Download from Google
    const downloaded = await downloadPhoto(photoRef.name, {
      maxWidthPx: 800,
      maxHeightPx: 600,
      triggeredBy,
      entityId: placeId,
    });

    if (!downloaded) {
      console.log(
        `[enrichPlaceFromGoogle] Skipping photo ${i}: download failed or budget exceeded`,
      );
      continue;
    }

    // Upload to Nhost Storage
    const formData = new FormData();
    const extension = downloaded.contentType.includes("png") ? "png" : "jpg";
    formData.append("file[]", downloaded.buffer, {
      filename: `place-${placeId}-${i}.${extension}`,
      contentType: downloaded.contentType,
    });
    formData.append("bucket-id", "item_images");

    const formBuffer = formData.getBuffer();
    const formHeaders = formData.getHeaders();

    const uploadResponse = await fetch(storageUrl, {
      method: "POST",
      headers: {
        ...formHeaders,
        "x-hasura-admin-secret": adminSecret,
        "Content-Length": String(formBuffer.length),
      },
      body: new Uint8Array(formBuffer),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(
        "[enrichPlaceFromGoogle] Storage upload failed:",
        uploadResponse.status,
        errorText,
      );
      continue;
    }

    const uploadResult = (await uploadResponse.json()) as {
      processedFiles: Array<{ id: string }>;
    };
    const fileId = uploadResult.processedFiles?.[0]?.id;

    if (!fileId) {
      console.error("[enrichPlaceFromGoogle] No file ID returned from storage");
      continue;
    }

    // Insert place_google_photos record
    const insertResult = await functionMutation(
      INSERT_PHOTO,
      {
        object: {
          place_id: placeId,
          google_photo_name: photoRef.name,
          storage_file_id: fileId,
          width: photoRef.widthPx,
          height: photoRef.heightPx,
          attributions: photoRef.authorAttributions ?? [],
          display_order: i,
        },
      },
      { headers },
    );

    const insertedId = insertResult.insert_place_google_photos_one?.id;
    if (insertedId) {
      uploadedPhotos.push({
        id: insertedId,
        storageFileId: fileId,
        displayOrder: i,
      });
    }
  }

  // Mark photos as fetched
  if (uploadedPhotos.length > 0) {
    await functionMutation(UPDATE_PHOTOS_FETCHED, { placeId }, { headers });
  }

  return uploadedPhotos;
}

// =============================================================================
// Main Handler
// =============================================================================

export default async (req: Request, res: Response) => {
  if (!validateAuth(req)) {
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  try {
    const body = req.body as EnrichPlaceBody;
    const { placeId, googlePlaceId, triggeredBy } = body;
    const maxPhotos = body.maxPhotos ?? 3;
    const headers = getAdminAuthHeaders();

    // Resolve the google_place_id and track how it was obtained:
    //   - "text_search":    no googlePlaceId provided, looked up via place name + location
    //   - "autocomplete":   googlePlaceId provided by client (from autocomplete or nearby UI)
    //                       along with a placeId (enriching an existing place)
    //   - "nearby_search":  googlePlaceId provided without placeId (pre-creation enrichment)
    let resolvedGooglePlaceId = googlePlaceId;
    let resolvedVia: "nearby_search" | "autocomplete" | "text_search" =
      "nearby_search";

    if (!resolvedGooglePlaceId && placeId) {
      // Look up the place to get its google_place_id or resolve via text search
      const placeResult = await functionQuery(
        GET_PLACE,
        { id: placeId },
        { headers },
      );
      const place = placeResult.places_by_pk;
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }

      if (place.google_place_id) {
        resolvedGooglePlaceId = place.google_place_id;
      } else {
        // Resolve via text search using place name + location
        const location = place.location as
          | { type: string; coordinates: number[] }
          | undefined;
        const lng = location?.coordinates?.[0] ?? 0;
        const lat = location?.coordinates?.[1] ?? 0;

        const searchResult = await textSearch(place.name, lat, lng, {
          triggeredBy,
          entityId: placeId,
        });

        if (!searchResult) {
          return res.json({
            success: true,
            enrichment: null,
            photos: [],
            reason: "Could not resolve Google Place ID",
          });
        }

        resolvedGooglePlaceId = searchResult.id;
        resolvedVia = "text_search";

        // Store the resolved google_place_id on the place
        await functionMutation(
          UPDATE_PLACE_GOOGLE_ID,
          { id: placeId, googlePlaceId: resolvedGooglePlaceId },
          { headers },
        );
      }
    } else if (resolvedGooglePlaceId && !placeId) {
      resolvedVia = "nearby_search";
    } else if (resolvedGooglePlaceId) {
      resolvedVia = "autocomplete";
    }

    if (!resolvedGooglePlaceId) {
      return res
        .status(400)
        .json({ error: "Either placeId or googlePlaceId is required" });
    }

    // Check if we already have fresh enrichment (< 30 days)
    if (placeId) {
      const existing = await functionQuery(
        GET_ENRICHMENT,
        { placeId },
        { headers },
      );
      const enrichment = existing.place_google_enrichments_by_pk;
      if (enrichment?.details_fetched_at) {
        const fetchedAt = new Date(enrichment.details_fetched_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (fetchedAt > thirtyDaysAgo) {
          // Enrichment is fresh — but photos may not have been fetched yet
          let photos: PhotoResult[] = [];
          const photoRefs = (enrichment.photo_references as unknown[]) ?? [];
          if (photoRefs.length > 0 && !enrichment.photos_fetched_at) {
            try {
              photos = await fetchAndStorePhotos(
                placeId,
                photoRefs,
                maxPhotos,
                triggeredBy,
                headers,
              );
            } catch (photoError) {
              console.error(
                "[enrichPlaceFromGoogle] Photo fetch failed (cached path):",
                photoError,
              );
            }
          } else if (photoRefs.length > 0) {
            // Photos already fetched — return existing
            try {
              const existingResult = await functionQuery(
                GET_EXISTING_PHOTOS,
                { placeId },
                { headers },
              );
              photos = existingResult.place_google_photos.map(toPhotoResult);
            } catch {
              // Non-critical
            }
          }

          return res.json({
            success: true,
            enrichment: mapDbEnrichment(enrichment),
            photos,
            cached: true,
          });
        }
      }
    }

    // Fetch details from Google
    const details = await getPlaceDetails(resolvedGooglePlaceId, {
      triggeredBy,
      entityId: placeId,
    });

    if (!details) {
      return res.json({
        success: true,
        enrichment: null,
        photos: [],
        reason: "Budget exceeded or API error",
      });
    }

    // Upsert enrichment record
    if (placeId) {
      await functionMutation(
        UPSERT_ENRICHMENT,
        {
          object: {
            place_id: placeId,
            google_place_id: resolvedGooglePlaceId,
            google_name: details.name,
            google_formatted_address: details.formattedAddress,
            google_rating: details.rating,
            google_user_ratings_total: details.userRatingsTotal,
            google_price_level: details.priceLevel,
            google_website: details.website,
            google_phone: details.phone,
            google_opening_hours: details.openingHours,
            google_types: details.types,
            google_business_status: details.businessStatus,
            google_editorial_summary: details.editorialSummary,
            photo_references: details.photoReferences,
            attributions: details.attributions,
            resolved_via: resolvedVia,
            details_fetched_at: new Date().toISOString(),
          },
        },
        { headers },
      );

      // Also set google_place_id on the place if not already set
      await functionMutation(
        UPDATE_PLACE_GOOGLE_ID,
        { id: placeId, googlePlaceId: resolvedGooglePlaceId },
        { headers },
      );
    }

    // Fetch and store photos
    let photos: PhotoResult[] = [];
    if (placeId && details.photoReferences.length > 0) {
      try {
        photos = await fetchAndStorePhotos(
          placeId,
          details.photoReferences,
          maxPhotos,
          triggeredBy,
          headers,
        );
      } catch (photoError) {
        console.error(
          "[enrichPlaceFromGoogle] Photo fetch failed:",
          photoError,
        );
      }
    }

    return res.json({
      success: true,
      enrichment: details,
      photos,
      cached: false,
    });
  } catch (error) {
    console.error("[enrichPlaceFromGoogle] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
