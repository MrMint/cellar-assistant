import { graphql } from "@cellar-assistant/shared/gql/graphql";
import {
  createFunctionNhostClient,
  functionQuery,
  getAdminAuthHeaders,
} from "../index";
import { hasProperty, isRecord } from "../types";
import { GoogleAIProvider } from "./google-ai";
import { OllamaProvider } from "./ollama";
import type { AIProvider } from "./types";
import { VertexAIProvider } from "./vertex-ai";

let cachedProvider: AIProvider | null = null;

export async function createAIProvider(): Promise<AIProvider> {
  // Return cached provider if available
  if (cachedProvider) {
    return cachedProvider;
  }

  const environment = process.env.NODE_ENV;
  const providerType = process.env.AI_PROVIDER;

  console.log(
    `Creating AI provider: ${providerType} for environment: ${environment}`,
  );

  switch (providerType) {
    case "ollama":
      cachedProvider = new OllamaProvider({
        provider: "ollama",
        endpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434",
      });
      break;

    case "google-ai":
      if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error(
          "GOOGLE_AI_API_KEY environment variable is required for google-ai provider",
        );
      }

      cachedProvider = new GoogleAIProvider({
        provider: "google-ai",
        apiKey: process.env.GOOGLE_AI_API_KEY,
      });
      break;

    case "vertex-ai": {
      // Get credentials for Vertex AI
      const credentials = await getVertexAICredentials();

      if (!process.env.GOOGLE_GCP_PROJECT_ID) {
        throw new Error(
          "GOOGLE_GCP_PROJECT_ID environment variable is required for vertex-ai provider",
        );
      }

      cachedProvider = new VertexAIProvider({
        provider: "vertex-ai",
        projectId: process.env.GOOGLE_GCP_PROJECT_ID,
        location: process.env.GOOGLE_GCP_VERTEX_AI_LOCATION || "us-central1",
        credentials,
      });
      break;
    }

    default:
      throw new Error(`Unknown AI provider: ${providerType}`);
  }

  return cachedProvider;
}

async function getVertexAICredentials() {
  console.log("🔐 [VertexAI] Starting credential retrieval process");

  // Check for file-based credentials first
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
      "🔐 [VertexAI] Using file-based credentials from:",
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    );
    try {
      const fs = await import("node:fs/promises");
      const credentialsJson = await fs.readFile(
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        "utf-8",
      );
      const credentials = JSON.parse(credentialsJson);

      // Log credential structure (without sensitive data)
      console.log("🔐 [VertexAI] File credentials structure:", {
        type: credentials.type,
        project_id: credentials.project_id,
        client_email: credentials.client_email ? "[PRESENT]" : "[MISSING]",
        private_key: credentials.private_key ? "[PRESENT]" : "[MISSING]",
        hasAllRequiredFields: !!(
          credentials.type &&
          credentials.project_id &&
          credentials.client_email &&
          credentials.private_key
        ),
      });

      return credentials;
    } catch (error) {
      console.error(
        "❌ [VertexAI] Failed to read file-based credentials:",
        error,
      );
      throw new Error(
        `Failed to read credentials file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  console.log(
    "🔐 [VertexAI] No file-based credentials found, fetching from database",
  );

  // Validate environment variables
  // Validate required environment variables without logging sensitive data
  console.log("🔐 [VertexAI] Validating environment configuration...");

  if (!process.env.CREDENTIALS_GCP_ID) {
    console.error(
      "❌ [VertexAI] CREDENTIALS_GCP_ID environment variable is missing",
    );
    throw new Error(
      "CREDENTIALS_GCP_ID environment variable is required for vertex-ai provider",
    );
  }

  if (!process.env.NHOST_ADMIN_SECRET) {
    console.error(
      "❌ [VertexAI] NHOST_ADMIN_SECRET environment variable is missing",
    );
    throw new Error(
      "NHOST_ADMIN_SECRET environment variable is required for database access",
    );
  }

  // Fetch from database
  console.log(
    "🔐 [VertexAI] Initializing Nhost client for credential retrieval",
  );
  const _nhostClient = createFunctionNhostClient();

  console.log(
    "🔐 [VertexAI] Fetching credentials from database with ID:",
    process.env.CREDENTIALS_GCP_ID,
  );

  try {
    const getCredential = graphql(`
      query GetCredential($id: String!) {
        admin_credentials_by_pk(id: $id) {
          id
          credentials
        }
      }
    `);

    const result = await functionQuery(
      getCredential,
      { id: process.env.CREDENTIALS_GCP_ID },
      { headers: getAdminAuthHeaders() },
    );

    console.log("🔐 [VertexAI] Database query result:", {
      hasCredentialRecord: !!result.admin_credentials_by_pk,
      hasCredentials: !!result.admin_credentials_by_pk?.credentials,
    });

    if (!result.admin_credentials_by_pk) {
      console.error(
        "❌ [VertexAI] No credential record found with ID:",
        process.env.CREDENTIALS_GCP_ID,
      );
      throw new Error(
        `No credential record found with ID: ${process.env.CREDENTIALS_GCP_ID}`,
      );
    }

    if (!result.admin_credentials_by_pk.credentials) {
      console.error(
        "❌ [VertexAI] Credential record exists but credentials field is empty",
      );
      throw new Error(
        "Credential record exists but credentials field is empty",
      );
    }

    const credentials = result.admin_credentials_by_pk.credentials;

    // Validate credential structure (without logging sensitive data)
    const credentialInfo = {
      type: typeof credentials,
      isObject: isRecord(credentials),
      hasProjectId:
        isRecord(credentials) &&
        hasProperty(credentials, "project_id") &&
        !!credentials.project_id,
      hasClientEmail:
        isRecord(credentials) &&
        hasProperty(credentials, "client_email") &&
        !!credentials.client_email,
      hasPrivateKey:
        isRecord(credentials) &&
        hasProperty(credentials, "private_key") &&
        !!credentials.private_key,
      hasType:
        isRecord(credentials) &&
        hasProperty(credentials, "type") &&
        !!credentials.type,
    };

    console.log(
      "🔐 [VertexAI] Database credentials structure:",
      credentialInfo,
    );

    if (!credentialInfo.isObject) {
      console.error(
        "❌ [VertexAI] Credentials is not an object:",
        typeof credentials,
      );
      throw new Error(
        `Invalid credentials format: expected object, got ${typeof credentials}`,
      );
    }

    if (
      !credentialInfo.hasProjectId ||
      !credentialInfo.hasClientEmail ||
      !credentialInfo.hasPrivateKey
    ) {
      console.error(
        "❌ [VertexAI] Credentials missing required fields:",
        credentialInfo,
      );
      throw new Error(
        "Credentials missing required fields (project_id, client_email, or private_key)",
      );
    }

    console.log(
      "✅ [VertexAI] Successfully retrieved and validated credentials from database",
    );
    return credentials;
  } catch (error) {
    console.error(
      "❌ [VertexAI] Error during database credential retrieval:",
      error,
    );
    if (error instanceof Error) {
      throw error; // Re-throw known errors
    }
    throw new Error(`Unknown error during credential retrieval: ${error}`);
  }
}

// Reset the cached provider (useful for testing)
export function resetProviderCache(): void {
  cachedProvider = null;
}
