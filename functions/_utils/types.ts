import type { graphql } from "@cellar-assistant/shared";
import type { ResultOf, TadaDocumentNode, VariablesOf } from "gql.tada";

/**
 * Base GraphQL response structure
 */
export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

/**
 * Type for gql.tada document input
 * Uses TadaDocumentNode as the base type with fallback to ReturnType<typeof graphql>
 */
export type DocumentInput = TadaDocumentNode | ReturnType<typeof graphql>;

/**
 * GraphQL client interface with proper typing
 */
export interface TypedGraphQLClient {
  graphql: {
    request: <TDocument extends DocumentInput>(
      query: TDocument,
      variables?: VariablesOf<TDocument>,
    ) => Promise<GraphQLResponse<ResultOf<TDocument>>>;
  };
}

/**
 * Simplified GraphQL client for functions that don't need full typing
 * Uses DocumentInput instead of any for type safety
 */
export interface GraphQLClient {
  graphql: {
    request: (
      query: DocumentInput,
      variables?: Record<string, unknown>,
    ) => Promise<GraphQLResponse>;
  };
}

/**
 * Enum query response structure
 */
export interface EnumQueryResponse {
  __type?: {
    enumValues?: Array<{ name: string; description?: string }>;
  };
}

/**
 * Presigned URL response from Nhost storage SDK
 * The SDK returns FetchResponse<PresignedURLResponse> with this structure
 */
export interface PresignedUrlResponse {
  body: {
    url: string;
    expiration: number;
  };
  status: number;
  headers: Headers;
}

/**
 * Valid item types across the application
 * @deprecated Use ItemTypeValue from @cellar-assistant/shared instead
 * This type is kept for backward compatibility only
 */
export type ValidItemType = "wine" | "beer" | "spirit" | "coffee" | "sake";

/**
 * Extended item types including unknown for menu processing
 */
export type ExtendedItemType = ValidItemType | "unknown";

/**
 * Form data upload response
 */
export interface UploadResponse {
  processedFiles?: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    bucketId: string;
    etag: string;
    createdAt: string;
    updatedAt: string;
    isUploaded: boolean;
  }>;
  error?: {
    message: string;
    status?: number;
  };
}

/**
 * Database event data structure for triggers
 */
export interface DatabaseEventData<T = Record<string, unknown>> {
  event: {
    session_variables: Record<string, string>;
    op: "INSERT" | "UPDATE" | "DELETE" | "MANUAL";
    data: {
      old?: T;
      new?: T;
    };
  };
  table: {
    schema: string;
    name: string;
  };
  trigger: {
    name: string;
  };
}

/**
 * Session variables from Hasura
 */
export interface SessionVariables {
  "x-hasura-user-id": string;
  "x-hasura-role": string;
  "x-hasura-default-role"?: string;
  "x-hasura-allowed-roles"?: string;
  [key: string]: string | undefined;
}

/**
 * Standard function request structure
 */
export interface FunctionRequest<TInput = Record<string, unknown>> {
  input: TInput;
  session_variables: SessionVariables;
}

/**
 * Standard function response structure
 */
export interface FunctionResponse<TData = unknown> {
  data?: TData;
  error?: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * AI response structure
 */
export interface AIResponse<T = unknown> {
  content: T;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  model?: string;
  finishReason?: string;
}

/**
 * Type guard for checking if value is not null or undefined
 */
export function isNotNil<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * Type guard for checking if value is a record
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if value has a specific property
 */
export function hasProperty<K extends string>(
  value: unknown,
  property: K,
): value is Record<K, unknown> {
  return isRecord(value) && property in value;
}

/**
 * Type guard for checking if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Type guard for checking if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Type guard for checking if value is an array
 */
export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Safely extract a string property from an unknown object
 */
export function extractString(
  obj: unknown,
  key: string,
  defaultValue = "",
): string {
  if (hasProperty(obj, key) && isString(obj[key])) {
    return obj[key];
  }
  return defaultValue;
}

/**
 * Safely extract a number property from an unknown object
 */
export function extractNumber(
  obj: unknown,
  key: string,
  defaultValue = 0,
): number {
  if (hasProperty(obj, key) && isNumber(obj[key])) {
    return obj[key];
  }
  return defaultValue;
}

/**
 * Safely extract an array property from an unknown object
 */
export function extractArray<T>(
  obj: unknown,
  key: string,
  defaultValue: T[] = [],
): T[] {
  if (hasProperty(obj, key) && isArray<T>(obj[key])) {
    return obj[key];
  }
  return defaultValue;
}
