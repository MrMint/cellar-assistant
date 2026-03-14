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
import {
  analyzeItemImages,
  fetchLabelImages,
} from "../getItemDefaults/_analyze";
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

/** Convert a year string ("2019") to a date string ("2019-01-01") for date columns.
 * Returns null for anything that isn't a 4-digit year or an already-valid date,
 * so non-vintage strings ("NV", "Unknown", etc.) don't blow up the date constraint. */
function vintageToDate(vintage: string | undefined): string | null {
  if (!vintage) return null;
  if (/^\d{4}$/.test(vintage)) return `${vintage}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(vintage)) return vintage;
  return null;
}

/** Strip null/undefined values from an object so Hasura _set only touches fields
 * the AI actually returned, leaving any user-edited fields intact. */
function compactSet<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null),
  ) as Partial<T>;
}

/**
 * Update the linked item record (wine/beer/spirit/coffee/sake) after a successful
 * onboarding reprocess. This causes the generate_vector event trigger to fire,
 * regenerating the item's embeddings automatically.
 */
// No typed SakeAIDefaults exists in _utils — define the relevant fields here
type SakeAIDefaults = {
  name: string;
  vintage?: string | number;
  country?: string;
  region?: string;
  description?: string;
  alcohol_content_percentage?: number;
};

/**
 * Update the linked item record (wine/beer/spirit/coffee/sake) after a successful
 * onboarding reprocess. This causes the generate_vector event trigger to fire,
 * regenerating the item's embeddings automatically.
 * Returns true if an item was found and updated, false if no linked item exists.
 */
async function updateLinkedItem(
  onboardingId: string,
  itemType: ItemType,
  aiDefaults: AIDefaults,
  headers: { headers: Record<string, string> },
): Promise<boolean> {
  switch (itemType) {
    case "WINE": {
      const lookup = await functionQuery(
        GET_WINE_ID_QUERY,
        { onboarding_id: onboardingId },
        headers,
      );
      const wineId = lookup?.wines?.[0]?.id;
      if (!wineId) return false;
      const d = aiDefaults as WineAIDefaults;
      await functionMutation(
        updateWineMutation,
        {
          wineId,
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
      return true;
    }
    case "BEER": {
      const lookup = await functionQuery(
        GET_BEER_ID_QUERY,
        { onboarding_id: onboardingId },
        headers,
      );
      const beerId = lookup?.beers?.[0]?.id;
      if (!beerId) return false;
      const d = aiDefaults as BeerAIDefaults;
      await functionMutation(
        updateBeerMutation,
        {
          beerId,
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
      return true;
    }
    case "SPIRIT": {
      const lookup = await functionQuery(
        GET_SPIRIT_ID_QUERY,
        { onboarding_id: onboardingId },
        headers,
      );
      const spiritId = lookup?.spirits?.[0]?.id;
      if (!spiritId) return false;
      const d = aiDefaults as SpiritAIDefaults;
      await functionMutation(
        updateSpiritMutation,
        {
          spiritId,
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
      return true;
    }
    case "COFFEE": {
      const lookup = await functionQuery(
        GET_COFFEE_ID_QUERY,
        { onboarding_id: onboardingId },
        headers,
      );
      const coffeeId = lookup?.coffees?.[0]?.id;
      if (!coffeeId) return false;
      const d = aiDefaults as CoffeeAIDefaults;
      await functionMutation(
        updateCoffeeMutation,
        {
          coffeeId,
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
      return true;
    }
    case "SAKE": {
      const lookup = await functionQuery(
        GET_SAKE_ID_QUERY,
        { onboarding_id: onboardingId },
        headers,
      );
      const sakeId = lookup?.sakes?.[0]?.id;
      if (!sakeId) return false;
      const d = aiDefaults as unknown as SakeAIDefaults;
      const parsed =
        typeof d.vintage === "string" ? parseInt(d.vintage, 10) : d.vintage;
      const vintageYear =
        parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined;
      await functionMutation(
        updateSakeMutation,
        {
          sakeId,
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
      return true;
    }
    default:
      console.warn(
        `[ReprocessBatch] No item update handler for type: ${itemType}`,
      );
      return false;
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

        // Update the linked item record so the generate_vector trigger fires
        try {
          const itemsUpdated = await updateLinkedItem(
            onboarding.id,
            onboarding.item_type as ItemType,
            aiDefaults,
            headers,
          );
          if (itemsUpdated) {
            console.log(
              `[ReprocessBatch] Updated linked item for onboarding ${onboarding.id}`,
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
