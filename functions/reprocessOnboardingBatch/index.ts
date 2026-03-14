import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";
import {
  type Beers_Set_Input,
  type Coffees_Set_Input,
  type Sakes_Set_Input,
  type Spirits_Set_Input,
  type Wines_Set_Input,
  updateBeerMutation,
  updateCoffeeMutation,
  updateSakeMutation,
  updateSpiritMutation,
  updateWineMutation,
} from "@cellar-assistant/shared/queries";
import type { Request, Response } from "express";
import {
  createAIPerformanceTracker,
  createFunctionNhostClient,
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { linkItemToBrand } from "../_utils/recipe-database/brand-management";
import {
  analyzeItemImages,
  fetchLabelImages,
} from "../getItemDefaults/_analyze";
import { processBrandFromAIDefaults } from "../getItemDefaults/_brand";
import { getSchemaForItemType } from "../getItemDefaults/_schemas";
import {
  calculateConfidence,
  getAllEnumValues,
  type AIDefaults,
  type BeerAIDefaults,
  type CoffeeAIDefaults,
  type ItemType,
  type SpiritAIDefaults,
  type WineAIDefaults,
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
    $skip_reasons: jsonb
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
        skip_reasons: $skip_reasons
        updated_at: "now()"
      }
    ) {
      id
    }
  }
`);

const SET_REPROCESS_RESULT_MUTATION = graphql(`
  mutation SetOnboardingReprocessResult(
    $id: uuid!
    $last_reprocess_result: jsonb!
  ) {
    update_item_onboardings_by_pk(
      pk_columns: { id: $id }
      _set: { last_reprocess_result: $last_reprocess_result }
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

// Lookup queries — resolve item ID from onboarding ID so we can use the shared pk mutations
const GET_WINE_ID_QUERY = graphql(`
  query GetWineIdByOnboarding($onboarding_id: uuid!) {
    wines(where: { item_onboarding_id: { _eq: $onboarding_id } }, limit: 1) {
      id
    }
  }
`);

const GET_BEER_ID_QUERY = graphql(`
  query GetBeerIdByOnboarding($onboarding_id: uuid!) {
    beers(where: { item_onboarding_id: { _eq: $onboarding_id } }, limit: 1) {
      id
    }
  }
`);

const GET_SPIRIT_ID_QUERY = graphql(`
  query GetSpiritIdByOnboarding($onboarding_id: uuid!) {
    spirits(
      where: { item_onboarding_id: { _eq: $onboarding_id } }
      limit: 1
    ) {
      id
    }
  }
`);

const GET_COFFEE_ID_QUERY = graphql(`
  query GetCoffeeIdByOnboarding($onboarding_id: uuid!) {
    coffees(
      where: { item_onboarding_id: { _eq: $onboarding_id } }
      limit: 1
    ) {
      id
    }
  }
`);

const GET_SAKE_ID_QUERY = graphql(`
  query GetSakeIdByOnboarding($onboarding_id: uuid!) {
    sakes(where: { item_onboarding_id: { _eq: $onboarding_id } }, limit: 1) {
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
// Helpers
// =============================================================================

/** Merge this batch's skip reasons into the job's accumulated reasons. */
function mergeSkipReasons(
  existing: Record<string, number> | null,
  batch: Record<string, number>,
): Record<string, number> {
  const merged = { ...(existing ?? {}) };
  for (const [reason, count] of Object.entries(batch)) {
    merged[reason] = (merged[reason] ?? 0) + count;
  }
  return merged;
}

/** Convert a year string ("2019") to a date string ("2019-01-01") for date columns.
 * Returns null for anything that isn't a 4-digit year or an already-valid date,
 * so non-vintage strings ("NV", "Unknown", etc.) don't blow up the date constraint. */
function vintageToDate(vintage: string | undefined): string | null {
  if (!vintage) return null;
  if (/^\d{4}$/.test(vintage)) return `${vintage}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(vintage)) return vintage;
  return null;
}

/** Placeholder values the AI uses when it can't extract real data. */
const PLACEHOLDER_VALUES = new Set([
  "n/a", "na", "none", "unknown", "not available", "not specified", "unspecified",
]);

/** Returns true if a value is meaningful (not null, undefined, placeholder, or zero). */
function isMeaningfulValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "" || PLACEHOLDER_VALUES.has(normalized)) return false;
    if (/^0+$/.test(normalized)) return false;
  }
  return true;
}

/** Strip null/undefined/placeholder values from an object so Hasura _set only
 * touches fields the AI actually returned with real data. */
function compactSet<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => isMeaningfulValue(v)),
  ) as Partial<T>;
}

// No typed SakeAIDefaults exists in _utils — define the relevant fields here
type SakeAIDefaults = {
  name: string;
  vintage?: string | number;
  country?: string;
  region?: string;
  description?: string;
  alcohol_content_percentage?: number;
};

/** Look up the linked item ID for an onboarding record. Returns null if no item exists. */
async function findLinkedItemId(
  onboardingId: string,
  itemType: ItemType,
  headers: { headers: Record<string, string> },
): Promise<string | null> {
  switch (itemType) {
    case "WINE": {
      const r = await functionQuery(GET_WINE_ID_QUERY, { onboarding_id: onboardingId }, headers);
      return r?.wines?.[0]?.id ?? null;
    }
    case "BEER": {
      const r = await functionQuery(GET_BEER_ID_QUERY, { onboarding_id: onboardingId }, headers);
      return r?.beers?.[0]?.id ?? null;
    }
    case "SPIRIT": {
      const r = await functionQuery(GET_SPIRIT_ID_QUERY, { onboarding_id: onboardingId }, headers);
      return r?.spirits?.[0]?.id ?? null;
    }
    case "COFFEE": {
      const r = await functionQuery(GET_COFFEE_ID_QUERY, { onboarding_id: onboardingId }, headers);
      return r?.coffees?.[0]?.id ?? null;
    }
    case "SAKE": {
      const r = await functionQuery(GET_SAKE_ID_QUERY, { onboarding_id: onboardingId }, headers);
      return r?.sakes?.[0]?.id ?? null;
    }
    default:
      return null;
  }
}

/**
 * Update the linked item record (wine/beer/spirit/coffee/sake) after a successful
 * onboarding reprocess. Caller must provide the pre-fetched itemId.
 * This causes the generate_vector event trigger to fire,
 * regenerating the item's embeddings automatically.
 */
async function updateLinkedItem(
  itemId: string,
  itemType: ItemType,
  aiDefaults: AIDefaults,
  headers: { headers: Record<string, string> },
): Promise<void> {
  switch (itemType) {
    case "WINE": {
      const d = aiDefaults as WineAIDefaults;
      await functionMutation(
        updateWineMutation,
        {
          wineId: itemId,
          wine: compactSet({
            name: d.name,
            vintage: vintageToDate(d.vintage),
            variety: d.variety,
            style: d.style,
            region: d.region,
            country: d.country,
            alcohol_content_percentage: d.alcohol_content_percentage,
            description: d.description,
          }) as unknown as Wines_Set_Input,
        },
        headers,
      );
      break;
    }
    case "BEER": {
      const d = aiDefaults as BeerAIDefaults;
      await functionMutation(
        updateBeerMutation,
        {
          beerId: itemId,
          beer: compactSet({
            name: d.name,
            vintage: vintageToDate(d.vintage),
            style: d.style,
            country: d.country,
            alcohol_content_percentage: d.alcohol_content_percentage,
            description: d.description,
          }) as unknown as Beers_Set_Input,
        },
        headers,
      );
      break;
    }
    case "SPIRIT": {
      const d = aiDefaults as SpiritAIDefaults;
      await functionMutation(
        updateSpiritMutation,
        {
          spiritId: itemId,
          spirit: compactSet({
            name: d.name,
            vintage: vintageToDate(d.vintage),
            type: d.type,
            style: d.style,
            country: d.country,
            alcohol_content_percentage: d.alcohol_content_percentage,
            description: d.description,
          }) as unknown as Spirits_Set_Input,
        },
        headers,
      );
      break;
    }
    case "COFFEE": {
      const d = aiDefaults as CoffeeAIDefaults;
      await functionMutation(
        updateCoffeeMutation,
        {
          coffeeId: itemId,
          coffee: compactSet({
            name: d.name,
            roast_level: d.roast_level,
            species: d.species,
            cultivar: d.cultivar,
            process: d.process,
            country: d.country,
            description: d.description,
          }) as unknown as Coffees_Set_Input,
        },
        headers,
      );
      break;
    }
    case "SAKE": {
      const d = aiDefaults as unknown as SakeAIDefaults;
      const parsed =
        typeof d.vintage === "string" ? parseInt(d.vintage, 10) : d.vintage;
      const vintageYear =
        parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined;
      await functionMutation(
        updateSakeMutation,
        {
          sakeId: itemId,
          sake: compactSet({
            name: d.name,
            vintage: vintageYear,
            country: d.country,
            region: d.region,
            description: d.description,
            alcohol_content_percentage: d.alcohol_content_percentage,
          }) as unknown as Sakes_Set_Input,
        },
        headers,
      );
      break;
    }
    default:
      console.warn(
        `[ReprocessBatch] No item update handler for type: ${itemType}`,
      );
  }
}

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
  const currentStatus = currentJob?.onboarding_reprocess_jobs_by_pk?.status;

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
          skip_reasons: job.skip_reasons ?? {},
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
    const skipReasons: Record<string, number> = {};

    /** Save a reprocess result to the onboarding row (fire-and-forget). */
    const saveReprocessResult = (
      onboardingId: string,
      result: Record<string, unknown>,
    ) => {
      functionMutation(
        SET_REPROCESS_RESULT_MUTATION,
        { id: onboardingId, last_reprocess_result: { ...result, job_id: job.id, at: new Date().toISOString() } },
        headers,
      ).catch((err) =>
        console.warn(`[ReprocessBatch] Failed to save reprocess result for ${onboardingId}:`, err),
      );
    };

    const trackSkip = (
      reason: string,
      onboarding: OnboardingRecord,
      detail?: string,
      aiDefaults?: AIDefaults,
    ) => {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      batchSkipped++;

      const context: Record<string, unknown> = {
        reason,
        onboardingId: onboarding.id,
        itemType: onboarding.item_type,
        userId: onboarding.user_id,
        existingModel: onboarding.ai_model,
        existingConfidence: onboarding.confidence,
        hasFrontLabel: !!onboarding.front_label_image_id,
        hasBackLabel: !!onboarding.back_label_image_id,
      };
      if (detail) context.detail = detail;

      // For post-AI skips, log key fields from what the AI returned
      if (aiDefaults && typeof aiDefaults === "object") {
        const d = aiDefaults as unknown as Record<string, unknown>;
        context.aiResult = {
          name: d.name,
          brand_name: d.brand_name ?? d.winery ?? d.brewery ?? d.distillery ?? d.roaster ?? d.kura,
          country: d.country,
          description: typeof d.description === "string"
            ? d.description.slice(0, 80)
            : d.description,
        };
      }

      console.log(`[ReprocessBatch] SKIP`, JSON.stringify(context));

      // Persist to onboarding row for future debugging
      const result: Record<string, unknown> = { status: "skipped", reason };
      if (detail) result.detail = detail;
      saveReprocessResult(onboarding.id, result);
    };

    for (const onboarding of onboardings) {
      try {
        const schema = await getSchemaForItemType(
          onboarding.item_type as ItemType,
        );
        if (!schema) {
          trackSkip("unknown_item_type", onboarding);
          continue;
        }

        const performanceTracker = createAIPerformanceTracker();

        const images = await fetchLabelImages(
          nhostClient,
          onboarding.front_label_image_id ?? undefined,
          onboarding.back_label_image_id ?? undefined,
        );

        if (images.length === 0) {
          trackSkip("no_images", onboarding);
          continue;
        }

        // Check for linked item before expensive AI call
        const itemType = onboarding.item_type as ItemType;
        const linkedItemId = await findLinkedItemId(onboarding.id, itemType, headers);
        if (!linkedItemId) {
          trackSkip("no_linked_item", onboarding);
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
          trackSkip(
            "confidence_regression",
            onboarding,
            `${existingConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}`,
            aiDefaults,
          );
          continue;
        }

        if (newConfidence < 0.3) {
          trackSkip(
            "low_confidence",
            onboarding,
            `new confidence ${newConfidence.toFixed(2)} too low to be useful`,
            aiDefaults,
          );
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

        // Update the linked item record so the generate_vector trigger fires,
        // and process brand — both only need aiDefaults so run in parallel.
        try {
          const [, brandResult] = await Promise.all([
            updateLinkedItem(linkedItemId, itemType, aiDefaults, headers),
            processBrandFromAIDefaults(aiDefaults, itemType),
          ]);
          console.log(
            `[ReprocessBatch] Updated linked item for onboarding ${onboarding.id}`,
          );
          if (brandResult) {
            await linkItemToBrand(
              linkedItemId,
              onboarding.item_type.toLowerCase() as
                | "wine"
                | "beer"
                | "spirit"
                | "coffee"
                | "sake",
              brandResult.id,
              true, // isPrimary
              true, // replace existing brand linkages
            );
          }
        } catch (itemError) {
          // Item update failure is non-fatal — onboarding was already updated
          console.warn(
            `[ReprocessBatch] Failed to update linked item for onboarding ${onboarding.id}:`,
            itemError,
          );
        }

        console.log(
          `[ReprocessBatch] Updated onboarding ${onboarding.id}: confidence ${existingConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}, model=${modelUsed}`,
        );
        saveReprocessResult(onboarding.id, {
          status: "updated",
          previous_confidence: existingConfidence,
          new_confidence: newConfidence,
          model: modelUsed,
        });
        batchUpdated++;
      } catch (recordError) {
        const errMsg = recordError instanceof Error ? recordError.message : String(recordError);
        trackSkip("error", onboarding, errMsg);
      }
    }

    const lastOnboarding = onboardings[onboardings.length - 1];
    const newCursor = lastOnboarding.created_at;
    const hasMore = onboardings.length === BATCH_SIZE;
    const newStatus = hasMore ? "processing" : "completed";
    const mergedReasons = mergeSkipReasons(job.skip_reasons, skipReasons);

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
        skip_reasons: mergedReasons,
      },
      headers,
    );

    const reasonsSummary = Object.entries(skipReasons)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ");

    console.log(
      `[ReprocessBatch] Batch ${job.total_batches + 1} done: ${batchUpdated} updated, ${batchSkipped} skipped${reasonsSummary ? ` (${reasonsSummary})` : ""} — status: ${newStatus}`,
    );

    return res.status(200).json({
      success: true,
      batch: job.total_batches + 1,
      updated: batchUpdated,
      skipped: batchSkipped,
      skipReasons,
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
