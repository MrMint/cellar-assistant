import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import {
  createAIPerformanceTracker,
  createFunctionNhostClient,
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { analyzeItemImages, fetchLabelImages } from "../getItemDefaults/_analyze";
import { getSchemaForItemType } from "../getItemDefaults/_schemas";
import {
  calculateConfidence,
  getAllEnumValues,
  type ItemType,
} from "../getItemDefaults/_utils";
import type { OnboardingReprocessBatchEventPayload } from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

// When an existing onboarding has no confidence recorded (pre-dates the column),
// treat it as 0.7 — the LOW threshold — so we only update if the new result is at least as good.
const CONFIDENCE_FALLBACK = 0.7;

// Number of onboardings to process per batch invocation.
// Keep small: each AI call takes ~5-20s, and function timeout is 118s.
const BATCH_SIZE = 3;

// Sentinel cursor value meaning "start from the beginning"
const CURSOR_START = "1900-01-01T00:00:00Z";

// =============================================================================
// GraphQL operations
// =============================================================================

const GET_JOB_STATUS_QUERY = graphql(`
  query GetOnboardingReprocessJobStatus($id: uuid!) {
    onboarding_reprocess_jobs_by_pk(id: $id) {
      id
      status
    }
  }
`);

const GET_ONBOARDINGS_BATCH_QUERY = graphql(`
  query GetOnboardingsBatchAll($cursor: timestamptz!, $limit: Int!) {
    item_onboardings(
      where: {
        _and: [
          {
            _or: [
              { front_label_image_id: { _is_null: false } }
              { back_label_image_id: { _is_null: false } }
            ]
          }
          { created_at: { _gt: $cursor } }
        ]
      }
      order_by: { created_at: asc }
      limit: $limit
    ) {
      id
      created_at
      item_type
      front_label_image_id
      back_label_image_id
      barcode
      barcode_type
      confidence
      ai_model
      user_id
    }
  }
`);

const GET_ONBOARDINGS_BATCH_FILTERED_QUERY = graphql(`
  query GetOnboardingsBatchFiltered(
    $cursor: timestamptz!
    $filter_ai_model: String!
    $limit: Int!
  ) {
    item_onboardings(
      where: {
        _and: [
          {
            _or: [
              { front_label_image_id: { _is_null: false } }
              { back_label_image_id: { _is_null: false } }
            ]
          }
          { created_at: { _gt: $cursor } }
          { ai_model: { _eq: $filter_ai_model } }
        ]
      }
      order_by: { created_at: asc }
      limit: $limit
    ) {
      id
      created_at
      item_type
      front_label_image_id
      back_label_image_id
      barcode
      barcode_type
      confidence
      ai_model
      user_id
    }
  }
`);

const UPDATE_ONBOARDING_MUTATION = graphql(`
  mutation UpdateOnboardingAfterReprocess(
    $id: uuid!
    $defaults: jsonb!
    $raw_defaults: String!
    $ai_model: String
    $confidence: float8!
  ) {
    update_item_onboardings_by_pk(
      pk_columns: { id: $id }
      _set: {
        defaults: $defaults
        raw_defaults: $raw_defaults
        ai_model: $ai_model
        confidence: $confidence
        updated_at: "now()"
      }
    ) {
      id
    }
  }
`);

const UPDATE_JOB_MUTATION = graphql(`
  mutation UpdateOnboardingReprocessJob(
    $id: uuid!
    $cursor: String
    $total_processed: Int!
    $total_updated: Int!
    $total_skipped: Int!
    $total_batches: Int!
    $status: String!
  ) {
    update_onboarding_reprocess_jobs_by_pk(
      pk_columns: { id: $id }
      _set: {
        cursor: $cursor
        total_processed: $total_processed
        total_updated: $total_updated
        total_skipped: $total_skipped
        total_batches: $total_batches
        status: $status
        updated_at: "now()"
      }
    ) {
      id
    }
  }
`);

const FAIL_JOB_MUTATION = graphql(`
  mutation FailOnboardingReprocessJob($id: uuid!, $error_message: String!) {
    update_onboarding_reprocess_jobs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "failed"
        error_message: $error_message
        updated_at: "now()"
      }
    ) {
      id
    }
  }
`);

// =============================================================================
// Types
// =============================================================================

type OnboardingRecord = ResultOf<
  typeof GET_ONBOARDINGS_BATCH_QUERY
>["item_onboardings"][number];

// =============================================================================
// Main handler
// =============================================================================

const nhostClient = createFunctionNhostClient();

export default async function reprocessOnboardingBatch(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    OnboardingReprocessBatchEventPayload
  >,
  res: Response,
) {
  if (req.method === "GET") return res.status(200).send();
  if (req.method !== "POST") return res.status(405).send();
  if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
    return res.status(400).send();
  }

  const job = req.body.event.data.new;

  // Re-query current status — the event snapshot may be stale
  // (e.g. job was cancelled after this event was queued)
  const currentJob = await functionQuery(
    GET_JOB_STATUS_QUERY,
    { id: job.id },
    { headers: getAdminAuthHeaders() },
  );
  const currentStatus =
    currentJob?.onboarding_reprocess_jobs_by_pk?.status;

  if (currentStatus !== "processing") {
    console.log(
      `[ReprocessBatch] Skipping job ${job.id} — status is '${currentStatus}'`,
    );
    return res.status(200).json({ success: true, skipped: true });
  }

  console.log(
    `[ReprocessBatch] Processing batch ${job.total_batches + 1} for job ${job.id}, cursor=${job.cursor ?? "START"}, filter_ai_model=${job.filter_ai_model ?? "ALL"}`,
  );

  try {
    const cursor = job.cursor ?? CURSOR_START;
    const headers = { headers: getAdminAuthHeaders() };

    // Fetch next batch of onboardings (two query variants to handle optional model filter)
    const batchData = job.filter_ai_model
      ? await functionQuery(
          GET_ONBOARDINGS_BATCH_FILTERED_QUERY,
          { cursor, filter_ai_model: job.filter_ai_model, limit: BATCH_SIZE },
          headers,
        )
      : await functionQuery(
          GET_ONBOARDINGS_BATCH_QUERY,
          { cursor, limit: BATCH_SIZE },
          headers,
        );

    const onboardings =
      (batchData?.item_onboardings as OnboardingRecord[] | undefined) ?? [];

    if (onboardings.length === 0) {
      // No more records — job is done
      await functionMutation(
        UPDATE_JOB_MUTATION,
        {
          id: job.id,
          cursor: job.cursor,
          total_processed: job.total_processed,
          total_updated: job.total_updated,
          total_skipped: job.total_skipped,
          total_batches: job.total_batches + 1,
          status: "completed",
        },
        headers,
      );
      console.log(`[ReprocessBatch] Job ${job.id} completed.`);
      return res.status(200).json({ success: true, status: "completed" });
    }

    const [aiProvider, enumValues] = await Promise.all([
      createAIProvider(),
      getAllEnumValues(),
    ]);

    let batchUpdated = 0;
    let batchSkipped = 0;

    for (const onboarding of onboardings) {
      try {
        const schema = await getSchemaForItemType(
          onboarding.item_type as ItemType,
        );
        if (!schema) {
          console.warn(
            `[ReprocessBatch] Unknown item_type '${onboarding.item_type}' for onboarding ${onboarding.id} — skipping`,
          );
          batchSkipped++;
          continue;
        }

        const performanceTracker = createAIPerformanceTracker();

        const images = await fetchLabelImages(
          nhostClient,
          onboarding.front_label_image_id ?? undefined,
          onboarding.back_label_image_id ?? undefined,
        );

        if (images.length === 0) {
          console.warn(
            `[ReprocessBatch] No images found for onboarding ${onboarding.id} — skipping`,
          );
          batchSkipped++;
          continue;
        }

        const { aiDefaults, modelUsed } = await analyzeItemImages({
          aiProvider,
          images,
          itemType: onboarding.item_type,
          schema,
          performanceTracker,
          enumValues,
        });

        const newConfidence = calculateConfidence(aiDefaults, schema);
        const existingConfidence = onboarding.confidence ?? CONFIDENCE_FALLBACK;

        if (newConfidence < existingConfidence) {
          console.log(
            `[ReprocessBatch] Skipping onboarding ${onboarding.id} — confidence dropped from ${existingConfidence.toFixed(2)} to ${newConfidence.toFixed(2)}`,
          );
          batchSkipped++;
          continue;
        }

        await functionMutation(
          UPDATE_ONBOARDING_MUTATION,
          {
            id: onboarding.id,
            defaults: aiDefaults,
            raw_defaults: JSON.stringify(aiDefaults),
            ai_model: modelUsed,
            confidence: newConfidence,
          },
          headers,
        );

        console.log(
          `[ReprocessBatch] Updated onboarding ${onboarding.id}: confidence ${existingConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}, model=${modelUsed}`,
        );
        batchUpdated++;
      } catch (recordError) {
        console.error(
          `[ReprocessBatch] Error processing onboarding ${onboarding.id}:`,
          recordError,
        );
        batchSkipped++;
      }
    }

    const lastOnboarding = onboardings[onboardings.length - 1];
    const newCursor = lastOnboarding.created_at;
    const hasMore = onboardings.length === BATCH_SIZE;
    const newStatus = hasMore ? "processing" : "completed";

    await functionMutation(
      UPDATE_JOB_MUTATION,
      {
        id: job.id,
        cursor: newCursor,
        total_processed: job.total_processed + onboardings.length,
        total_updated: job.total_updated + batchUpdated,
        total_skipped: job.total_skipped + batchSkipped,
        total_batches: job.total_batches + 1,
        status: newStatus,
      },
      headers,
    );

    console.log(
      `[ReprocessBatch] Batch ${job.total_batches + 1} done: ${batchUpdated} updated, ${batchSkipped} skipped — status: ${newStatus}`,
    );

    return res.status(200).json({
      success: true,
      batch: job.total_batches + 1,
      updated: batchUpdated,
      skipped: batchSkipped,
      status: newStatus,
    });
  } catch (error) {
    console.error(`[ReprocessBatch] Fatal error on job ${job.id}:`, error);

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
      console.error("[ReprocessBatch] Failed to update job status:", failError);
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
