import type { Request, Response } from "express";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";
import {
  createPlaceDataService,
  DB_UPSERT_BATCH_SIZE,
  type PlaceData,
} from "../refreshPlaces/_services";
import {
  FAIL_JOB_MUTATION,
  GET_JOB_STATUS_QUERY,
  type PlaceInsertData,
  UPDATE_JOB_MUTATION,
  UPSERT_PLACES_MUTATION,
} from "../refreshPlaces/_types.js";
import type { PlaceRefreshBatchEventPayload } from "./_types.js";

const { NHOST_WEBHOOK_SECRET } = process.env;

function transformPlaceForUpsert(place: PlaceData): PlaceInsertData {
  return {
    overture_id: place.overture_id,
    name: place.name,
    display_name: place.name,
    categories: place.categories,
    confidence: place.confidence,
    location: {
      type: "Point" as const,
      coordinates: [place.longitude, place.latitude],
    },
    street_address: place.address_freeform ?? null,
    locality: place.address_locality ?? null,
    region: place.address_region ?? null,
    postcode: place.address_postcode ?? null,
    country_code: place.address_country ?? null,
    phone: place.phone ?? null,
    website: place.website ?? null,
    email: null,
    is_active: true,
    is_verified: false,
    access_count: 0,
    first_cached_reason: "bulk_refresh",
  };
}

async function upsertPlacesBatch(places: PlaceData[]): Promise<number> {
  let totalUpserted = 0;

  for (let i = 0; i < places.length; i += DB_UPSERT_BATCH_SIZE) {
    const chunk = places.slice(i, i + DB_UPSERT_BATCH_SIZE);
    const insertData = chunk.map(transformPlaceForUpsert);

    const data = await functionMutation(
      UPSERT_PLACES_MUTATION,
      { places: insertData },
      { headers: getAdminAuthHeaders() },
    );

    totalUpserted += data?.insert_places?.affected_rows ?? 0;
  }

  return totalUpserted;
}

export default async function processPlaceRefreshBatch(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    PlaceRefreshBatchEventPayload
  >,
  res: Response,
) {
  if (req.method === "GET") return res.status(200).send();
  if (req.method !== "POST") return res.status(405).send();
  if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
    return res.status(400).send();
  }

  const job = req.body.event.data.new;

  // Re-query current status from DB — the event snapshot may be stale
  // (e.g. job was cancelled after this event was queued)
  const currentJob = await functionQuery(
    GET_JOB_STATUS_QUERY,
    { id: job.id },
    { headers: getAdminAuthHeaders() },
  );
  const currentStatus = currentJob?.place_refresh_jobs_by_pk?.status;

  if (currentStatus !== "processing") {
    console.log(
      `[BatchProcessor] Skipping job ${job.id} — status is '${currentStatus}'`,
    );
    return res.status(200).json({ success: true, skipped: true });
  }

  console.log(
    `[BatchProcessor] Processing batch ${job.total_batches + 1} for job ${job.id}, cursor=${job.cursor ?? "START"}`,
  );

  try {
    const placeDataService = createPlaceDataService();
    const batchStartTime = Date.now();

    // Fetch batch from BigQuery cached table
    const result = await placeDataService.fetchPlacesBatch({
      cursor: job.cursor ?? undefined,
    });

    console.log(
      `[BatchProcessor] Fetched ${result.places.length} places from BigQuery (${Date.now() - batchStartTime}ms)`,
    );

    // Upsert to database in chunks
    let upserted = 0;
    if (result.places.length > 0) {
      upserted = await upsertPlacesBatch(result.places);
    }

    const newTotalInserted = job.total_inserted + upserted;
    const newTotalBatches = job.total_batches + 1;
    const newStatus = result.hasMore ? "processing" : "completed";

    // Update job — if still processing, cursor change triggers next event
    await functionMutation(
      UPDATE_JOB_MUTATION,
      {
        id: job.id,
        cursor: result.lastId,
        total_inserted: newTotalInserted,
        total_batches: newTotalBatches,
        status: newStatus,
      },
      { headers: getAdminAuthHeaders() },
    );

    const batchDuration = Date.now() - batchStartTime;
    console.log(
      `[BatchProcessor] Batch ${newTotalBatches} complete: ${upserted} upserted (${batchDuration}ms) — total: ${newTotalInserted}, status: ${newStatus}`,
    );

    return res.status(200).json({
      success: true,
      batch: newTotalBatches,
      upserted,
      total_inserted: newTotalInserted,
      status: newStatus,
    });
  } catch (error) {
    console.error(`[BatchProcessor] Error on job ${job.id}:`, error);

    // Mark job as failed
    try {
      await functionMutation(
        FAIL_JOB_MUTATION,
        {
          id: job.id,
          error_message:
            error instanceof Error ? error.message : "Unknown error",
        },
        { headers: getAdminAuthHeaders() },
      );
    } catch (failError) {
      console.error("[BatchProcessor] Failed to update job status:", failError);
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
