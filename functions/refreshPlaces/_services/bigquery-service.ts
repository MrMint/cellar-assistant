import { BigQuery } from "@google-cloud/bigquery";
import { graphql } from "@cellar-assistant/shared/gql/graphql";
import {
  functionQuery,
  getAdminAuthHeaders,
} from "../../_utils/urql-client";
import { hasProperty, isRecord } from "../../_utils/types";
import type { PlaceData, PlaceDataService } from "./_types";

/**
 * Get GCP credentials following the same pattern as Vertex AI provider
 */
async function getGCPCredentials(): Promise<Record<string, unknown>> {
  console.log("🔐 [BigQuery] Starting credential retrieval process");

  // Check for file-based credentials first
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
      "🔐 [BigQuery] Using file-based credentials from:",
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    );
    try {
      const fs = await import("node:fs/promises");
      const credentialsJson = await fs.readFile(
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        "utf-8",
      );
      const credentials = JSON.parse(credentialsJson);

      console.log("🔐 [BigQuery] File credentials structure:", {
        type: credentials.type,
        project_id: credentials.project_id,
        client_email: credentials.client_email ? "[PRESENT]" : "[MISSING]",
        private_key: credentials.private_key ? "[PRESENT]" : "[MISSING]",
      });

      return credentials;
    } catch (error) {
      console.error(
        "❌ [BigQuery] Failed to read file-based credentials:",
        error,
      );
      throw new Error(
        `Failed to read credentials file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  console.log(
    "🔐 [BigQuery] No file-based credentials found, fetching from database",
  );

  // Validate environment variables
  if (!process.env.CREDENTIALS_GCP_ID) {
    console.error(
      "❌ [BigQuery] CREDENTIALS_GCP_ID environment variable is missing",
    );
    throw new Error(
      "CREDENTIALS_GCP_ID environment variable is required for BigQuery",
    );
  }

  if (!process.env.NHOST_ADMIN_SECRET) {
    console.error(
      "❌ [BigQuery] NHOST_ADMIN_SECRET environment variable is missing",
    );
    throw new Error(
      "NHOST_ADMIN_SECRET environment variable is required for database access",
    );
  }

  // Fetch from database
  console.log(
    "🔐 [BigQuery] Fetching credentials from database with ID:",
    process.env.CREDENTIALS_GCP_ID,
  );

  try {
    const getCredential = graphql(`
      query GetGCPCredential($id: String!) {
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

    console.log("🔐 [BigQuery] Database query result:", {
      hasCredentialRecord: !!result.admin_credentials_by_pk,
      hasCredentials: !!result.admin_credentials_by_pk?.credentials,
    });

    if (!result.admin_credentials_by_pk) {
      throw new Error(
        `No credential record found with ID: ${process.env.CREDENTIALS_GCP_ID}`,
      );
    }

    if (!result.admin_credentials_by_pk.credentials) {
      throw new Error("Credential record exists but credentials field is empty");
    }

    const credentials = result.admin_credentials_by_pk.credentials;

    // Validate credential structure
    if (!isRecord(credentials)) {
      throw new Error(
        `Invalid credentials format: expected object, got ${typeof credentials}`,
      );
    }

    const hasRequiredFields =
      hasProperty(credentials, "project_id") &&
      credentials.project_id &&
      hasProperty(credentials, "client_email") &&
      credentials.client_email &&
      hasProperty(credentials, "private_key") &&
      credentials.private_key;

    if (!hasRequiredFields) {
      throw new Error(
        "Credentials missing required fields (project_id, client_email, or private_key)",
      );
    }

    console.log(
      "✅ [BigQuery] Successfully retrieved and validated credentials from database",
    );
    return credentials as Record<string, unknown>;
  } catch (error) {
    console.error("❌ [BigQuery] Error during credential retrieval:", error);
    throw error;
  }
}

export class BigQueryPlaceDataService implements PlaceDataService {
  private bigqueryPromise: Promise<BigQuery>;

  constructor() {
    // Initialize BigQuery client asynchronously
    this.bigqueryPromise = this.initBigQuery();
  }

  private async initBigQuery(): Promise<BigQuery> {
    const credentials = await getGCPCredentials();

    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT_ID ||
      (credentials.project_id as string);

    console.log(`🔐 [BigQuery] Initializing client for project: ${projectId}`);

    return new BigQuery({
      projectId,
      credentials: credentials as {
        client_email: string;
        private_key: string;
      },
    });
  }

  async fetchPlaces(categories: string[]): Promise<PlaceData[]> {
    console.log(
      `[BigQueryPlaceDataService] Fetching data for ${categories.length} categories from Overture Maps`,
    );

    const bigquery = await this.bigqueryPromise;

    const query = `
      SELECT
        id as overture_id,
        names.primary as name,
        names.common as common_names,
        categories.primary as primary_category,
        categories.alternate as alternate_categories,
        confidence,
        ST_Y(geometry) as latitude,
        ST_X(geometry) as longitude,
        addresses,
        (SELECT STRING_AGG(p.element, ', ') FROM UNNEST(phones.list) as p) as phone,
        websites[SAFE_OFFSET(0)] as website,
        brand.names.primary as brand_name
      FROM \`bigquery-public-data.overture_maps.place\`
      WHERE
        confidence >= 0.7
        AND categories.primary IN UNNEST(@categories)
      ORDER BY confidence DESC, primary_category
    `;

    const [rows] = await bigquery.query({
      query,
      params: { categories },
      location: "US",
    });

    console.log(
      `[BigQueryPlaceDataService] Retrieved ${rows.length} places from BigQuery`,
    );

    // Transform data to match our interface
    const places: PlaceData[] = rows.map((row) => ({
      overture_id: row.overture_id,
      name: row.name || "Unknown",
      common_names: row.common_names || null,
      primary_category: row.primary_category,
      categories: row.alternate_categories || [row.primary_category],
      confidence: parseFloat(row.confidence),
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      address: row.addresses ? JSON.parse(JSON.stringify(row.addresses)) : null,
      phone: row.phone || null,
      website: row.website || null,
      brand_name: row.brand_name || null,
    }));

    return places;
  }

  getName(): string {
    return "BigQueryPlaceDataService";
  }
}
