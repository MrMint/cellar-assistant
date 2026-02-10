import { graphql } from "@cellar-assistant/shared/gql/graphql";
import { BigQuery } from "@google-cloud/bigquery";
import { hasProperty, isRecord } from "../../_utils/types";
import { functionQuery, getAdminAuthHeaders } from "../../_utils/urql-client";
import type {
  FetchPlacesBatchOptions,
  PlaceBatchResult,
  PlaceData,
  PlaceDataService,
} from "./_types";
import { BIGQUERY_BATCH_SIZE } from "./_types";

function getCachedTable(): string {
  const table = process.env.BIGQUERY_PLACES_TABLE;
  if (!table) {
    throw new Error("BIGQUERY_PLACES_TABLE environment variable is required");
  }
  return table;
}

/**
 * Get GCP credentials following the same pattern as Vertex AI provider
 */
async function getGCPCredentials(): Promise<Record<string, unknown>> {
  // Check for file-based credentials first
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const fs = await import("node:fs/promises");
      const credentialsJson = await fs.readFile(
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        "utf-8",
      );
      return JSON.parse(credentialsJson);
    } catch (error) {
      throw new Error(
        `Failed to read credentials file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  if (!process.env.CREDENTIALS_GCP_ID) {
    throw new Error(
      "CREDENTIALS_GCP_ID environment variable is required for BigQuery",
    );
  }

  if (!process.env.NHOST_ADMIN_SECRET) {
    throw new Error(
      "NHOST_ADMIN_SECRET environment variable is required for database access",
    );
  }

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

  if (!result.admin_credentials_by_pk?.credentials) {
    throw new Error(
      `No credential record found with ID: ${process.env.CREDENTIALS_GCP_ID}`,
    );
  }

  const credentials = result.admin_credentials_by_pk.credentials;

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

  return credentials as Record<string, unknown>;
}

export class BigQueryPlaceDataService implements PlaceDataService {
  private bigqueryPromise: Promise<BigQuery>;

  constructor() {
    this.bigqueryPromise = this.initBigQuery();
  }

  private async initBigQuery(): Promise<BigQuery> {
    const credentials = await getGCPCredentials();
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT_ID ?? (credentials.project_id as string);

    return new BigQuery({
      projectId,
      credentials: credentials as {
        client_email: string;
        private_key: string;
      },
    });
  }

  async fetchPlacesBatch(
    options: FetchPlacesBatchOptions = {},
  ): Promise<PlaceBatchResult> {
    const { cursor, limit = BIGQUERY_BATCH_SIZE } = options;

    console.log(
      `[BigQuery] Fetching batch: limit=${limit}, cursor=${cursor ?? "START"}`,
    );

    const bigquery = await this.bigqueryPromise;
    const cachedTable = getCachedTable();

    const cursorClause = cursor ? "WHERE overture_id > @cursor" : "";
    const query = `
      SELECT
        overture_id, name, primary_category, categories,
        confidence, latitude, longitude,
        address_freeform, address_locality, address_region,
        address_postcode, address_country,
        phone, website, brand_name
      FROM \`${cachedTable}\`
      ${cursorClause}
      ORDER BY overture_id
      LIMIT @limit
    `;

    const params: Record<string, unknown> = { limit };
    if (cursor) {
      params.cursor = cursor;
    }

    const [rows] = await bigquery.query({
      query,
      params,
      location: "US",
    });

    console.log(`[BigQuery] Retrieved ${rows.length} places`);

    const places: PlaceData[] = rows.map((row: Record<string, unknown>) => ({
      overture_id: row.overture_id as string,
      name: (row.name as string) ?? "Unknown",
      primary_category: row.primary_category as string,
      categories: (row.categories as string[]) ?? [
        row.primary_category as string,
      ],
      confidence: Number.parseFloat(String(row.confidence)),
      latitude: Number.parseFloat(String(row.latitude)),
      longitude: Number.parseFloat(String(row.longitude)),
      address_freeform: (row.address_freeform as string) ?? null,
      address_locality: (row.address_locality as string) ?? null,
      address_region: (row.address_region as string) ?? null,
      address_postcode: (row.address_postcode as string) ?? null,
      address_country: (row.address_country as string) ?? null,
      phone: (row.phone as string) ?? null,
      website: (row.website as string) ?? null,
      brand_name: (row.brand_name as string) ?? null,
    }));

    const lastId =
      places.length > 0 ? places[places.length - 1].overture_id : null;
    const hasMore = places.length === limit;

    return { places, lastId, hasMore };
  }

  getName(): string {
    return "BigQueryPlaceDataService";
  }
}
