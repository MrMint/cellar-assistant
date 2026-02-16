/**
 * Shared GCP credentials utility.
 * Provides a single getGCPCredentials() function reused by BigQuery, Vertex AI,
 * Google Places, and any future GCP service integrations.
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";
import { functionQuery, getAdminAuthHeaders } from "./urql-client";
import { hasProperty, isRecord } from "./types";

export interface GCPCredentials {
  type: string;
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

let cachedCredentials: GCPCredentials | null = null;

const GET_CREDENTIAL = graphql(`
  query GetGCPCredentialShared($id: String!) {
    admin_credentials_by_pk(id: $id) {
      id
      credentials
    }
  }
`);

/**
 * Get GCP credentials following the standard pattern:
 * 1. Check GOOGLE_APPLICATION_CREDENTIALS file path
 * 2. Fall back to admin_credentials table via CREDENTIALS_GCP_ID
 *
 * Results are cached for the lifetime of the process.
 */
export async function getGCPCredentials(): Promise<GCPCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  // Check for file-based credentials first
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const fs = await import("node:fs/promises");
      const credentialsJson = await fs.readFile(
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        "utf-8",
      );
      const credentials = JSON.parse(credentialsJson);
      validateCredentials(credentials);
      cachedCredentials = credentials as GCPCredentials;
      return cachedCredentials;
    } catch (error) {
      throw new Error(
        `Failed to read GCP credentials file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Fall back to database
  if (!process.env.CREDENTIALS_GCP_ID) {
    throw new Error(
      "Either GOOGLE_APPLICATION_CREDENTIALS or CREDENTIALS_GCP_ID is required",
    );
  }

  if (!process.env.NHOST_ADMIN_SECRET) {
    throw new Error(
      "NHOST_ADMIN_SECRET is required for database credential access",
    );
  }

  const result = await functionQuery(
    GET_CREDENTIAL,
    { id: process.env.CREDENTIALS_GCP_ID },
    { headers: getAdminAuthHeaders() },
  );

  if (!result.admin_credentials_by_pk?.credentials) {
    throw new Error(
      `No credential record found with ID: ${process.env.CREDENTIALS_GCP_ID}`,
    );
  }

  const credentials = result.admin_credentials_by_pk.credentials;
  validateCredentials(credentials);
  cachedCredentials = credentials as GCPCredentials;
  return cachedCredentials;
}

function validateCredentials(
  credentials: unknown,
): asserts credentials is GCPCredentials {
  if (!isRecord(credentials)) {
    throw new Error(
      `Invalid credentials format: expected object, got ${typeof credentials}`,
    );
  }

  const required = ["project_id", "client_email", "private_key"] as const;
  const missing = required.filter(
    (field) => !hasProperty(credentials, field) || !credentials[field],
  );

  if (missing.length > 0) {
    throw new Error(
      `GCP credentials missing required fields: ${missing.join(", ")}`,
    );
  }
}

/**
 * Reset cached credentials (useful for testing)
 */
export function resetCredentialsCache(): void {
  cachedCredentials = null;
}
