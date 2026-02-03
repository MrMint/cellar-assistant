import type { JSONSchema7 } from "json-schema";

// Re-export JSONSchema7 for use by other modules
export type { JSONSchema7 };

// Core types for AI provider abstraction
export type ItemType = "WINE" | "BEER" | "SPIRIT" | "COFFEE";

// Model quality tiers for provider abstraction
export type ModelQuality = "low" | "medium" | "high";

// Embedding task types for optimized vector generation
// See: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api
export type EmbeddingTaskType =
  | "RETRIEVAL_QUERY" // For search queries - optimized for finding relevant documents
  | "RETRIEVAL_DOCUMENT" // For indexing documents - optimized for being searched
  | "SEMANTIC_SIMILARITY" // For comparing similarity between texts
  | "CLASSIFICATION" // For classification tasks
  | "CLUSTERING" // For clustering operations
  | "QUESTION_ANSWERING" // For Q&A embeddings
  | "FACT_VERIFICATION" // For fact-checking
  | "CODE_RETRIEVAL_QUERY"; // For code search

export interface AIProviderConfig {
  provider: "vertex-ai" | "google-ai" | "ollama";
  projectId?: string;
  location?: string;
  apiKey?: string;
  quality?: ModelQuality;
  endpoint?: string;
  credentials?: Record<string, unknown>;
}

export interface GenerateContentRequest {
  prompt: string;
  images?: Buffer[];
  schema?: JSONSchema7;
}

export interface GenerateContentResponse {
  content: string;
  metadata?: {
    tokensUsed?: number;
    processingTime?: number;
    model?: string;
    provider?: string;
    note?: string;
  };
}

export interface EmbeddingRequest {
  content: string | Buffer;
  type: "text" | "image";
  model?: string;
  dimensions?: number;
  taskType?: EmbeddingTaskType;
}

export interface EmbeddingResponse {
  embeddings: number[];
  metadata?: {
    model?: string;
    dimensions?: number;
    provider?: string;
  };
}

export interface AIProvider {
  generateContent(
    request: GenerateContentRequest,
    quality?: ModelQuality,
  ): Promise<GenerateContentResponse>;
  generateEmbeddings?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  getAvailableQualities?(): ModelQuality[];
}

// Provider-specific configurations
export interface VertexAIConfig extends AIProviderConfig {
  provider: "vertex-ai";
  projectId: string;
  location: string;
  credentials?: Record<string, unknown>;
}

export interface GoogleAIConfig extends AIProviderConfig {
  provider: "google-ai";
  apiKey: string;
}

export interface OllamaConfig extends AIProviderConfig {
  provider: "ollama";
  endpoint?: string;
}
