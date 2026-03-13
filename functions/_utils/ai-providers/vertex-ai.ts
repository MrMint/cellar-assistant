import {
  type GenerationConfig,
  GoogleGenAI,
  type Part,
  ThinkingLevel,
} from "@google/genai";
import { hasProperty, isRecord } from "../types";
import type {
  AIProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  GenerateContentRequest,
  GenerateContentResponse,
  ModelQuality,
  VertexAIConfig,
} from "./types";

/**
 * Extract descriptions from JSON Schema for prompt augmentation
 */
function extractSchemaDescriptions(schema: unknown, path = ""): string[] {
  const descriptions: string[] = [];

  function traverse(node: unknown, currentPath: string) {
    if (!isRecord(node)) return;
    if (!node || typeof node !== "object") return;

    if (node.description) {
      descriptions.push(`• ${currentPath}: ${node.description}`);
    }

    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        traverse(value, newPath);
      }
    }

    if (node.items) {
      traverse(node.items, `${currentPath}[]`);
    }
  }

  traverse(schema, path);
  return descriptions;
}

/**
 * Convert JSON Schema to Vertex AI OpenAPI schema format
 * IMPORTANT: Vertex AI requires UPPERCASE type names (STRING, OBJECT, ARRAY, etc.)
 * Based on official Vertex AI Gemini responseSchema documentation (2024-2025)
 * Supported types: STRING, INTEGER, NUMBER, BOOLEAN, ARRAY, OBJECT
 * Supported constraints: minimum, maximum, enum, required, minItems, maxItems
 */
function convertJsonSchemaToVertexSchema(jsonSchema: unknown): unknown {
  function convertType(schemaNode: unknown): unknown {
    if (!isRecord(schemaNode)) return { type: "STRING" };
    if (!schemaNode || typeof schemaNode !== "object") {
      return { type: "STRING" };
    }

    switch (schemaNode.type) {
      case "object": {
        const properties: Record<string, unknown> = {};
        const propertyKeys: string[] = [];
        if (schemaNode.properties) {
          for (const [key, value] of Object.entries(schemaNode.properties)) {
            properties[key] = convertType(value);
            propertyKeys.push(key);
          }
        }
        return {
          type: "OBJECT",
          properties,
          // Include propertyOrdering to ensure consistent field generation order
          // This helps the model generate fields in the expected sequence
          ...(propertyKeys.length > 0 && { propertyOrdering: propertyKeys }),
          ...(schemaNode.required && { required: schemaNode.required }),
          ...(schemaNode.nullable && { nullable: schemaNode.nullable }),
        };
      }

      case "array":
        return {
          type: "ARRAY",
          items: schemaNode.items
            ? convertType(schemaNode.items)
            : { type: "STRING" },
          ...(schemaNode.minItems !== undefined && {
            minItems: schemaNode.minItems,
          }),
          ...(schemaNode.maxItems !== undefined && {
            maxItems: schemaNode.maxItems,
          }),
          ...(schemaNode.nullable && { nullable: schemaNode.nullable }),
        };

      case "string":
        return {
          type: "STRING",
          // Include description to guide the AI on field purpose
          ...(schemaNode.description && {
            description: schemaNode.description,
          }),
          // Make all fields nullable to prevent the model from skipping uncertain fields
          nullable: true,
          // NOTE: 'enum' removed - large enum arrays cause INVALID_ARGUMENT
          // NOTE: 'format' removed - causes INVALID_ARGUMENT in some Vertex AI versions
        };

      case "number":
        return {
          type: "NUMBER",
          // Include description to guide the AI on field purpose
          ...(schemaNode.description && {
            description: schemaNode.description,
          }),
          // Make all fields nullable to prevent the model from skipping uncertain fields
          nullable: true,
          // NOTE: 'minimum'/'maximum' removed - may cause INVALID_ARGUMENT
        };

      case "integer":
        return {
          type: "INTEGER",
          // Include description to guide the AI on field purpose
          ...(schemaNode.description && {
            description: schemaNode.description,
          }),
          // Make all fields nullable to prevent the model from skipping uncertain fields
          nullable: true,
          // NOTE: 'minimum'/'maximum' removed - may cause INVALID_ARGUMENT
        };

      case "boolean":
        return {
          type: "BOOLEAN",
          // Include description to guide the AI on field purpose
          ...(schemaNode.description && {
            description: schemaNode.description,
          }),
          // Make all fields nullable to prevent the model from skipping uncertain fields
          nullable: true,
        };

      default:
        return { type: "STRING" };
    }
  }

  return convertType(jsonSchema);
}

export class VertexAIProvider implements AIProvider {
  private ai: GoogleGenAI;
  // Separate client for embeddings — gemini-embedding-2 is only available in us-central1
  private embeddingAi: GoogleGenAI;
  // Valid Vertex AI Gemini model names
  // See: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash
  // Note: Gemini 3 models require global endpoint and support thinking_level parameter
  private qualityModelMap: Record<ModelQuality, string> = {
    low: "gemini-3.1-flash-lite-preview",
    medium: "gemini-3.1-flash-lite-preview",
    high: "gemini-3.1-pro-preview",
  };

  // Map quality levels to Gemini 3 thinking levels
  // MINIMAL: Near-zero reasoning, optimized for throughput
  // LOW: Light reasoning
  // MEDIUM: Balanced speed and reasoning
  // HIGH: Full reasoning capability
  private qualityThinkingMap: Record<ModelQuality, ThinkingLevel> = {
    low: ThinkingLevel.MINIMAL,
    medium: ThinkingLevel.MEDIUM,
    high: ThinkingLevel.MEDIUM,
  };

  constructor(config: VertexAIConfig) {
    console.log("🔰 [VertexAI] Initializing provider with config:", {
      projectId: config.projectId,
      location: config.location,
      hasCredentials: !!config.credentials,
      credentialsType: config.credentials ? typeof config.credentials : "none",
    });

    // Validate required configuration
    if (!config.projectId) {
      throw new Error("VertexAI provider requires projectId");
    }

    if (!config.location) {
      throw new Error("VertexAI provider requires location");
    }

    if (!config.credentials) {
      throw new Error("VertexAI provider requires credentials");
    }

    // Validate credentials structure
    if (!isRecord(config.credentials)) {
      throw new Error("❌ [VertexAI] Credentials must be an object");
    }

    const creds = config.credentials;
    const hasValidStructure =
      hasProperty(creds, "project_id") &&
      creds.project_id &&
      hasProperty(creds, "client_email") &&
      creds.client_email &&
      hasProperty(creds, "private_key") &&
      creds.private_key;

    if (!hasValidStructure) {
      console.error("❌ [VertexAI] Invalid credentials structure:", {
        hasProjectId: hasProperty(creds, "project_id") && !!creds.project_id,
        hasClientEmail:
          hasProperty(creds, "client_email") && !!creds.client_email,
        hasPrivateKey: hasProperty(creds, "private_key") && !!creds.private_key,
        hasType: hasProperty(creds, "type") && !!creds.type,
      });
      throw new Error(
        "VertexAI credentials missing required fields (project_id, client_email, private_key)",
      );
    }

    console.log("🔰 [VertexAI] Credentials validation passed");

    // For Vertex AI, we need to set up Google Cloud authentication via environment variables
    // The GoogleGenAI client will pick up authentication from the environment
    try {
      // Store credentials for potential use in authentication setup
      if (config.credentials) {
        // Set up authentication via environment variable (if not already set)
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          console.log(
            "🔐 [VertexAI] Setting up authentication from provided credentials",
          );
          // Note: In production, credentials should be properly managed
          // For now, we'll rely on the credentials being properly set up in the environment
        }
      }

      this.ai = new GoogleGenAI({
        vertexai: true,
        project: config.projectId,
        location: config.location,
        apiVersion: "v1", // Use stable API
        googleAuthOptions: {
          credentials: config.credentials,
        },
      });

      // gemini-embedding-2-preview is only available in us-central1,
      // not the global endpoint used for Gemini 3 content models
      this.embeddingAi = new GoogleGenAI({
        vertexai: true,
        project: config.projectId,
        location: "us-central1",
        apiVersion: "v1",
        googleAuthOptions: {
          credentials: config.credentials,
        },
      });

      console.log(
        `✅ [VertexAI] Provider successfully initialized for project: ${config.projectId}, location: ${config.location} (embeddings: us-central1)`,
      );
    } catch (error) {
      console.error(
        "❌ [VertexAI] Failed to initialize GoogleGenAI client:",
        error,
      );
      throw new Error(
        `Failed to initialize VertexAI client: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async generateContent(
    request: GenerateContentRequest,
    quality: ModelQuality = "low",
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();

    try {
      const modelName = this.qualityModelMap[quality];
      console.log(
        `VertexAI generateContent with model: ${modelName} (quality: ${quality})`,
      );
      console.log(`Images provided: ${request.images?.length || 0}`);

      // Build the content parts for the API call

      // Augment prompt with schema descriptions for Vertex AI compatibility
      let enhancedPrompt = request.prompt;
      if (request.schema) {
        const descriptions = extractSchemaDescriptions(request.schema);
        if (descriptions.length > 0) {
          enhancedPrompt += `\n\n## FIELD DESCRIPTIONS\n\n${descriptions.join("\n")}`;
          console.log(
            `VertexAI: Augmented prompt with ${descriptions.length} field descriptions`,
          );
        }
      }

      const parts: Part[] = [{ text: enhancedPrompt }];

      // Add images if provided
      if (request.images && request.images.length > 0) {
        for (const image of request.images) {
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: image.toString("base64"),
            },
          });
        }
      }

      // Prepare the generation config
      // IMPORTANT: Vertex AI uses responseSchema (not responseJsonSchema) with UPPERCASE types
      const generationConfig: GenerationConfig = {
        // Configure thinking level for Gemini 3 models
        // This replaces thinking_budget from Gemini 2.x
        thinkingConfig: {
          thinkingLevel: this.qualityThinkingMap[quality],
        },
      };

      // Add JSON schema support if provided
      // Convert JSON Schema to Vertex AI format with UPPERCASE types
      // NOTE: We strip enum, format, minimum, maximum as they cause INVALID_ARGUMENT
      // NOTE: All fields are marked nullable: true to prevent model from skipping uncertain fields
      if (request.schema) {
        const vertexSchema = convertJsonSchemaToVertexSchema(request.schema);
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = vertexSchema;

        // Debug: Log the converted schema
        console.log(
          "🔍 [VertexAI] Original schema properties:",
          Object.keys(request.schema.properties ?? {}),
        );
        console.log(
          "🔍 [VertexAI] Converted schema (with nullable: true on all fields):",
          JSON.stringify(vertexSchema, null, 2),
        );
      }

      // Make the API call with proper role structure for Vertex AI
      const requestPayload = {
        model: modelName,
        contents: [{ role: "user", parts }],
        config: generationConfig,
      };

      console.log(
        `🔍 [VertexAI] Calling ${modelName} with ${parts.length} parts, schema: ${!!request.schema}`,
      );

      const response = await this.ai.models.generateContent(requestPayload);

      // Extract the response text
      const content =
        response.text ||
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        "";

      return {
        content,
        metadata: {
          tokensUsed: response.usageMetadata?.totalTokenCount,
          processingTime: Date.now() - startTime,
          model: modelName,
          provider: "vertex-ai",
        },
      };
    } catch (error) {
      console.error("❌ [VertexAI] generateContent failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to generate content with Vertex AI: ${errorMessage}`,
      );
    }
  }

  async generateEmbeddings(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    try {
      console.log(`Vertex AI generateEmbeddings with type: ${request.type}`);

      // Gemini Embedding 2 provides a unified multimodal embedding space
      // Both text and images produce compatible vectors for cross-modal search
      const embeddingModel = request.model || "gemini-embedding-2-preview";
      const dimensions = request.dimensions || 768;

      if (request.type === "text" && typeof request.content === "string") {
        const taskType = request.taskType || "RETRIEVAL_DOCUMENT";
        const hasImages = request.images && request.images.length > 0;

        console.log(
          `[VertexAI] Generating ${hasImages ? "multimodal" : "text"} embeddings with model: ${embeddingModel}, dimensions: ${dimensions}, taskType: ${taskType}${hasImages ? `, images: ${request.images?.length}` : ""}`,
        );

        // Build content parts: text + optional images for combined multimodal embedding
        const contents: unknown[] = [request.content];
        if (hasImages && request.images) {
          for (const image of request.images) {
            contents.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: image.toString("base64"),
              },
            });
          }
        }

        const response = await this.embeddingAi.models.embedContent({
          model: embeddingModel,
          contents,
          config: {
            outputDimensionality: dimensions,
            taskType: taskType,
          },
        });

        return {
          embeddings: response.embeddings?.[0]?.values || [],
          metadata: {
            model: embeddingModel,
            dimensions: response.embeddings?.[0]?.values?.length || dimensions,
            provider: "vertex-ai",
          },
        };
      } else if (request.type === "image" && Buffer.isBuffer(request.content)) {
        // Image-only embedding (e.g. for search-by-image queries)
        const imageBase64 = request.content.toString("base64");
        console.log(
          `[VertexAI] Generating image-only embeddings with model: ${embeddingModel}, dimensions: ${dimensions}, image size: ${imageBase64.length} chars`,
        );

        const response = await this.embeddingAi.models.embedContent({
          model: embeddingModel,
          contents: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
          ],
          config: {
            outputDimensionality: dimensions,
          },
        });

        return {
          embeddings: response.embeddings?.[0]?.values || [],
          metadata: {
            model: embeddingModel,
            dimensions: response.embeddings?.[0]?.values?.length || dimensions,
            provider: "vertex-ai",
          },
        };
      } else {
        throw new Error(
          `Invalid embedding request: type ${request.type} with content type ${typeof request.content}`,
        );
      }
    } catch (error) {
      console.error("Vertex AI generateEmbeddings failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to generate embeddings with Vertex AI: ${errorMessage}`,
      );
    }
  }

  getAvailableQualities(): ModelQuality[] {
    return ["low", "medium", "high"];
  }
}
