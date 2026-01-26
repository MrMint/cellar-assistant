import { type GenerationConfig, GoogleGenAI, type Part } from "@google/genai";
import type {
  AIProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  GenerateContentRequest,
  GenerateContentResponse,
  GoogleAIConfig,
  ModelQuality,
} from "./types";

export class GoogleAIProvider implements AIProvider {
  private ai: GoogleGenAI;
  private qualityModelMap: Record<ModelQuality, string> = {
    low: "gemini-1.5-flash",
    medium: "gemini-1.5-pro",
    high: "gemini-2.0-flash-exp",
  };

  constructor(config: GoogleAIConfig) {
    // Initialize the Google GenAI client for Google AI (not Vertex AI)
    this.ai = new GoogleGenAI({
      apiKey: config.apiKey,
    });

    console.log(`Google AI provider initialized`);
  }

  async generateContent(
    request: GenerateContentRequest,
    quality: ModelQuality = "medium",
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();

    try {
      const modelName = this.qualityModelMap[quality];
      console.log(
        `Google AI generateContent with model: ${modelName} (quality: ${quality})`,
      );
      console.log(`Images provided: ${request.images?.length || 0}`);

      // Build the content parts for the API call
      const parts: Part[] = [{ text: request.prompt }];

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
      const generationConfig: GenerationConfig = {};

      // Add JSON schema support if provided
      // Use responseJsonSchema for standard JSON Schema format (Google AI)
      // Note: Vertex AI uses responseSchema with UPPERCASE types instead
      if (request.schema) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseJsonSchema = request.schema;
      }

      // Make the API call
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: [{ parts }],
        config: generationConfig,
      });

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
          provider: "google-ai",
        },
      };
    } catch (error) {
      console.error("Google AI generateContent failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to generate content with Google AI: ${errorMessage}`,
      );
    }
  }

  async generateEmbeddings(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    try {
      console.log(`Google AI generateEmbeddings with type: ${request.type}`);

      const embeddingModel = request.model || "text-embedding-004";

      if (request.type === "text" && typeof request.content === "string") {
        // Text embeddings
        const response = await this.ai.models.embedContent({
          model: embeddingModel,
          contents: request.content,
        });

        return {
          embeddings: response.embeddings?.[0]?.values || [],
          metadata: {
            model: embeddingModel,
            dimensions:
              response.embeddings?.[0]?.values?.length || request.dimensions,
            provider: "google-ai",
          },
        };
      } else if (request.type === "image" && Buffer.isBuffer(request.content)) {
        // Multimodal embeddings (image)
        const response = await this.ai.models.embedContent({
          model: "multimodalembedding@001", // Multimodal embedding model
          contents: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: request.content.toString("base64"),
              },
            },
          ],
        });

        return {
          embeddings: response.embeddings?.[0]?.values || [],
          metadata: {
            model: "multimodalembedding@001",
            dimensions: response.embeddings?.[0]?.values?.length || 1408, // Default multimodal dimension
            provider: "google-ai",
          },
        };
      } else {
        throw new Error(
          `Invalid embedding request: type ${request.type} with content type ${typeof request.content}`,
        );
      }
    } catch (error) {
      console.error("Google AI generateEmbeddings failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to generate embeddings with Google AI: ${errorMessage}`,
      );
    }
  }

  getAvailableQualities(): ModelQuality[] {
    return ["low", "medium", "high"];
  }
}
