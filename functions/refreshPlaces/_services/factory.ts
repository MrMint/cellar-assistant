import type { PlaceDataService } from "./_types";
import { BigQueryPlaceDataService } from "./bigquery-service";
import { MockPlaceDataService } from "./mock-service";

/**
 * Factory function to create the appropriate place data service
 * based on the environment
 */
export function createPlaceDataService(): PlaceDataService {
  // Check if we have credentials available (file-based or database-based)
  const hasFileCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasDatabaseCredentials = !!process.env.CREDENTIALS_GCP_ID;
  const hasCredentials = hasFileCredentials || hasDatabaseCredentials;

  const isLocalDevelopment =
    process.env.NODE_ENV === "development" || process.env.NHOST_LOCAL === "true";

  // Use mock service only for local development without credentials
  if (isLocalDevelopment && !hasCredentials) {
    console.log(
      "[PlaceDataServiceFactory] Creating MockPlaceDataService for local development",
    );
    return new MockPlaceDataService();
  }

  if (!hasCredentials) {
    console.warn(
      "[PlaceDataServiceFactory] No GCP credentials found (GOOGLE_APPLICATION_CREDENTIALS or CREDENTIALS_GCP_ID), falling back to mock service",
    );
    return new MockPlaceDataService();
  }

  console.log(
    `[PlaceDataServiceFactory] Creating BigQueryPlaceDataService (credentials: ${hasFileCredentials ? "file" : "database"})`,
  );
  return new BigQueryPlaceDataService();
}

// Export service classes for testing
export { MockPlaceDataService, BigQueryPlaceDataService };
export type { PlaceData, PlaceDataService } from "./_types";
