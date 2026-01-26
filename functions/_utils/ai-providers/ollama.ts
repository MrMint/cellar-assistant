import { Ollama } from "ollama";
import type {
  AIProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  GenerateContentRequest,
  GenerateContentResponse,
  ModelQuality,
  OllamaConfig,
} from "./types";

export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private qualityModelMap: Record<ModelQuality, string> = {
    low: "gemma3:4b",
    medium: "gemma3:4b",
    high: "gemma3:12b",
  };

  constructor(config: OllamaConfig) {
    this.client = new Ollama({
      host: config.endpoint || "http://localhost:11434",
    });
  }

  async generateContent(
    request: GenerateContentRequest,
    quality: ModelQuality = "medium",
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();

    try {
      const modelName = this.qualityModelMap[quality];
      // Check if model is available
      await this.ensureModelAvailable(modelName);
      console.log(
        `Ollama generateContent with model: ${modelName} (quality: ${quality})`,
      );
      console.log(`Ollama generateContent with prompt: ${request.prompt}`);
      if (request.schema) {
        console.log(
          `Ollama generateContent with schema keys: ${Object.keys(request.schema)}`,
        );
        console.log(
          `Ollama generateContent with schema type: ${request.schema.type}`,
        );
        if (request.schema.properties) {
          console.log(
            `Ollama generateContent with schema properties: ${Object.keys(request.schema.properties)}`,
          );
        }
      }

      const response = await this.client.chat({
        model: modelName,
        messages: [
          {
            role: "user",
            content: request.prompt,
            images: request.images?.map((img) => img.toString("base64")) || [],
          },
        ],
        format: request.schema || undefined, // Pass the full JSON schema object
      });
      console.log(
        `Ollama generateContent completed in ${Date.now() - startTime}ms`,
      );

      console.log(`Ollama response: ${JSON.stringify(response)}`);
      return {
        content: response.message.content,
        metadata: {
          processingTime: Date.now() - startTime,
          model: modelName,
          provider: "ollama",
        },
      };
    } catch (error) {
      console.error("Ollama generateContent failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to generate content with Ollama: ${errorMessage}`,
      );
    }
  }

  private async ensureModelAvailable(modelName: string): Promise<void> {
    try {
      const models = await this.client.list();
      const modelExists = models.models.some((m) => m.name === modelName);

      if (!modelExists) {
        console.log(`Pulling model ${modelName}...`);
        await this.client.pull({ model: modelName });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to ensure model availability: ${errorMessage}`);
    }
  }

  async generateEmbeddings(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    try {
      console.log(`Ollama generateEmbeddings with type: ${request.type}`);

      if (request.type === "image") {
        throw new Error(
          "Ollama doesn't support image embeddings yet. Use text embeddings only.",
        );
      }
      // https://github.com/ollama/ollama/issues/5304
      if (typeof request.content !== "string") {
        throw new Error("Ollama embeddings require string input for text type");
      }

      // Use nomic-embed-text model for embeddings (need to ensure it's pulled)
      const embeddingModel = request.model || "nomic-embed-text";

      const response = await this.client.embeddings({
        model: embeddingModel,
        prompt: request.content,
      });

      return {
        embeddings: response.embedding,
        metadata: {
          model: embeddingModel,
          dimensions: response.embedding.length,
          provider: "ollama",
        },
      };
    } catch (error) {
      console.error("Ollama generateEmbeddings failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to generate embeddings with Ollama: ${errorMessage}`,
      );
    }
  }

  getAvailableQualities(): ModelQuality[] {
    return ["low", "medium", "high"];
  }
}
