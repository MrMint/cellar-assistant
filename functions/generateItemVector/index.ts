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
  getAdminAuthHeaders,
  getConfig,
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

const _nhostClient = createFunctionNhostClient();

// Get shared configuration
const CONFIG = getConfig();

// TableName and getDeleteVectorWhereClause are now imported from ./types.ts

// Schema-driven embedding text generation - now maintainable and configurable!
const getEmbeddingText = (type: TableName, item: ItemType): string => {
  return generateEmbeddingText(type, item);
};

// validateInput is now replaced with validateGenerateVectorInput from ./types.ts

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

  // Generate text embedding with performance tracking
  const endEmbeddingTimer = performanceTracker.startTimer(
    "externalApiDuration",
  );
  const embeddingResponse = await aiProvider.generateEmbeddings?.({
    content: embeddingText,
    type: "text",
    taskType: "RETRIEVAL_DOCUMENT", // Optimized for being searched
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
