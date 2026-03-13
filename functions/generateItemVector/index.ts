import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import {
  createErrorResponse,
  createFunctionNhostClient,
  createPerformanceTracker,
  DatabaseError,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
  getConfig,
  getFilePresignedURLWithAuth,
  logError,
  logPerformanceMetrics,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { generateEmbeddingText } from "./_embedding-generator";
import type { GenerateVectorInput, ItemType, TableName } from "./_types";
import {
  createDeleteVectorWhereClause,
  validateGenerateVectorInput,
} from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

const nhostClient = createFunctionNhostClient();

// Get shared configuration
const CONFIG = getConfig();

// Schema-driven embedding text generation
const getEmbeddingText = (type: TableName, item: ItemType): string => {
  return generateEmbeddingText(type, item);
};

/**
 * Queries to fetch images for embedding.
 * Each query fetches the most recent display image for the item type.
 * Separate queries avoid Hasura's null uuid validation issue with _or.
 */
const GET_BEER_IMAGE_QUERY = graphql(`
  query GetBeerImage($itemId: uuid!) {
    item_image(
      where: { beer_id: { _eq: $itemId } }
      order_by: { created_at: desc }
      limit: 1
    ) { file_id }
  }
`);

const GET_WINE_IMAGE_QUERY = graphql(`
  query GetWineImage($itemId: uuid!) {
    item_image(
      where: { wine_id: { _eq: $itemId } }
      order_by: { created_at: desc }
      limit: 1
    ) { file_id }
  }
`);

const GET_SPIRIT_IMAGE_QUERY = graphql(`
  query GetSpiritImage($itemId: uuid!) {
    item_image(
      where: { spirit_id: { _eq: $itemId } }
      order_by: { created_at: desc }
      limit: 1
    ) { file_id }
  }
`);

const GET_COFFEE_IMAGE_QUERY = graphql(`
  query GetCoffeeImage($itemId: uuid!) {
    item_image(
      where: { coffee_id: { _eq: $itemId } }
      order_by: { created_at: desc }
      limit: 1
    ) { file_id }
  }
`);

const DISPLAY_IMAGE_QUERIES = {
  beers: GET_BEER_IMAGE_QUERY,
  wines: GET_WINE_IMAGE_QUERY,
  spirits: GET_SPIRIT_IMAGE_QUERY,
  coffees: GET_COFFEE_IMAGE_QUERY,
} as const;

/**
 * Query to fetch onboarding label images (front + back) for an item.
 * The item_onboarding_id is available on the event trigger payload.
 */
const GET_ONBOARDING_IMAGES_QUERY = graphql(`
  query GetOnboardingImages($onboardingId: uuid!) {
    item_onboardings_by_pk(id: $onboardingId) {
      front_label_image_id
      back_label_image_id
    }
  }
`);

export default async function generateItemVector(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    GenerateVectorInput
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateGenerateVectorInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      table: { name },
      event: {
        data: { new: item },
      },
    } = validatedInput;

    console.log(`Processing ${name} vector generation for item ${item.id}`);

    const result = await executeWithRetry(
      () => processVectorGeneration(name, item, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: `${name} vector generation`,
        context: { itemId: item.id, tableName: name },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { itemId: item.id, tableName: name },
      {
        functionName: "generateItemVector",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateGenerateVectorInput(req.body);
      errorContext = {
        itemId: context.event.data.new.id,
        tableName: context.table.name,
      };
    } catch {
      errorContext = {
        tableName: req.body?.table?.name || "unknown",
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "generateItemVector");

    const errorResponse = createErrorResponse(
      exception,
      "generateItemVector",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processVectorGeneration(
  name: TableName,
  item: ItemType,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<{ success: boolean; vectorId?: number }> {
  // Get the AI provider with performance tracking
  const endProviderTimer = performanceTracker.startTimer("externalApiDuration");
  const aiProvider = await createAIProvider();
  endProviderTimer();

  // Build descriptive text for the item
  const embeddingText = getEmbeddingText(name, item);
  console.log(`Generated embedding text: ${embeddingText}`);

  // Fetch images for the item: onboarding labels (front + back) + most recent display image
  // Gemini Embedding 2 supports up to 6 images; we use up to 3 for a rich multimodal embedding
  const imageBuffers = await fetchItemImages(name, item, performanceTracker);

  // Generate combined text+image embedding with performance tracking
  // Gemini Embedding 2 produces a single vector encoding both textual and visual information
  const endEmbeddingTimer = performanceTracker.startTimer(
    "externalApiDuration",
  );
  const embeddingResponse = await aiProvider.generateEmbeddings?.({
    content: embeddingText,
    type: "text",
    taskType: "RETRIEVAL_DOCUMENT",
    images: imageBuffers,
  });
  endEmbeddingTimer();

  if (!embeddingResponse?.embeddings) {
    throw new DatabaseError("Failed to generate embeddings");
  }

  console.log(
    `Generated vector with ${embeddingResponse.embeddings.length} dimensions`,
  );

  // Insert vector into database with performance tracking
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
  const insertVectorMutation = graphql(`
    mutation InsertVector($vector: item_vectors_insert_input!) {
      insert_item_vectors_one(object: $vector) {
        id
      }
    }
  `);

  const insertVectorResult = await functionMutation(
    insertVectorMutation,
    {
      vector: {
        beer_id: name === "beers" ? String(item.id) : undefined,
        spirit_id: name === "spirits" ? String(item.id) : undefined,
        wine_id: name === "wines" ? String(item.id) : undefined,
        coffee_id: name === "coffees" ? String(item.id) : undefined,
        vector: JSON.stringify(embeddingResponse.embeddings),
      },
    },
    { headers: getAdminAuthHeaders() },
  );
  endDbTimer();

  if (!insertVectorResult) {
    throw new DatabaseError("Failed to insert item vector");
  }

  const vectorId = insertVectorResult?.insert_item_vectors_one?.id;
  console.log(`Inserted item_vector with id ${vectorId}`);

  // Delete old vectors with performance tracking
  const endDeleteTimer = performanceTracker.startTimer("dbOperationDuration");
  const deleteVectorsMutation = graphql(`
    mutation DeleteVectors($where: item_vectors_bool_exp!) {
      delete_item_vectors(where: $where) {
        affected_rows
      }
    }
  `);

  const deleteOldVectorsResult = await functionMutation(
    deleteVectorsMutation,
    {
      where: createDeleteVectorWhereClause(name, vectorId, String(item.id)),
    },
    { headers: getAdminAuthHeaders() },
  );
  endDeleteTimer();

  if (!deleteOldVectorsResult) {
    console.warn("Failed to delete old vectors");
  } else {
    console.log(
      `Removed ${deleteOldVectorsResult?.delete_item_vectors?.affected_rows} old vector(s)`,
    );
  }

  return { success: true, vectorId };
}

/**
 * Fetch images for an item to include in the multimodal embedding.
 * Collects up to 3 images: front label, back label (from onboarding), and most recent display image.
 * Returns image buffers in order: [front_label, back_label, display_image] (skipping any that don't exist).
 */
async function fetchItemImages(
  name: TableName,
  item: ItemType,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<Buffer[]> {
  try {
    // Collect file IDs from onboarding labels and display image
    const fileIds: { id: string; label: string }[] = [];

    // 1. Fetch onboarding label images (front + back) via item_onboarding_id
    const onboardingId = (item as Record<string, unknown>).item_onboarding_id;
    if (onboardingId && typeof onboardingId === "string") {
      const endOnboardingTimer = performanceTracker.startTimer("dbOperationDuration");
      const onboardingResult = await functionQuery(
        GET_ONBOARDING_IMAGES_QUERY,
        { onboardingId },
        { headers: getAdminAuthHeaders() },
      );
      endOnboardingTimer();

      const onboarding = onboardingResult?.item_onboardings_by_pk;
      if (onboarding?.front_label_image_id) {
        fileIds.push({ id: onboarding.front_label_image_id, label: "front_label" });
      }
      if (onboarding?.back_label_image_id) {
        fileIds.push({ id: onboarding.back_label_image_id, label: "back_label" });
      }
    }

    // 2. Fetch most recent display image
    const displayQuery = DISPLAY_IMAGE_QUERIES[name];
    if (displayQuery) {
      const endQueryTimer = performanceTracker.startTimer("dbOperationDuration");
      const imageResult = await functionQuery(
        displayQuery,
        { itemId: String(item.id) },
        { headers: getAdminAuthHeaders() },
      );
      endQueryTimer();

      const displayFileId = imageResult?.item_image?.[0]?.file_id;
      if (displayFileId) {
        fileIds.push({ id: displayFileId, label: "display" });
      }
    }

    if (fileIds.length === 0) {
      console.log(`No images found for ${name} ${item.id}, using text-only embedding`);
      return [];
    }

    console.log(
      `Found ${fileIds.length} image(s) for ${name} ${item.id}: ${fileIds.map((f) => f.label).join(", ")}`,
    );

    // 3. Fetch all images in parallel
    const endFetchTimer = performanceTracker.startTimer("externalApiDuration");
    const buffers = await Promise.all(
      fileIds.map((file) => fetchImageBuffer(file.id, file.label)),
    );
    endFetchTimer();

    const validBuffers = buffers.filter((b): b is Buffer => b !== null);
    console.log(
      `Fetched ${validBuffers.length}/${fileIds.length} image(s) for ${name} ${item.id}`,
    );
    return validBuffers;
  } catch (error) {
    // Image fetch failures should not block vector generation — fall back to text-only
    console.warn(
      `Failed to fetch images for ${name} ${item.id}, falling back to text-only:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * Fetch a single image by file ID from Nhost storage. Returns null on failure.
 */
async function fetchImageBuffer(
  fileId: string,
  label: string,
): Promise<Buffer | null> {
  try {
    const presignedUrlResponse = await getFilePresignedURLWithAuth(
      nhostClient,
      fileId,
    );

    const { body, status } =
      presignedUrlResponse as import("../_utils/types").PresignedUrlResponse;
    if (status < 200 || status >= 300 || !body?.url) {
      console.warn(`Failed to get presigned URL for ${label} image ${fileId}: status ${status}`);
      return null;
    }

    const response = await fetch(body.url);
    if (!response.ok) {
      console.warn(`Failed to fetch ${label} image ${fileId}: ${response.statusText}`);
      return null;
    }

    const imageData = await response.arrayBuffer();
    return Buffer.from(imageData);
  } catch (error) {
    console.warn(
      `Failed to fetch ${label} image ${fileId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
