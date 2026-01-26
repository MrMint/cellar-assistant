import type { PlaceDataService } from "./_types";
import { BigQueryPlaceDataService } from "./bigquery-service";
import { MockPlaceDataService } from "./mock-service";

/**
 * Factory function to create the appropriate place data service
 * based on the environment
 */
export function createPlaceDataService(): PlaceDataService {
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.NHOST_LOCAL === "true" ||
    !process.env.GOOGLE_CLOUD_PROJECT_ID;

  if (isDevelopment) {
    console.log(
      "[PlaceDataServiceFactory] Creating MockPlaceDataService for development",
    );
    return new MockPlaceDataService();
  }

  console.log(
    "[PlaceDataServiceFactory] Creating BigQueryPlaceDataService for production",
  );
  return new BigQueryPlaceDataService();
}

// Export service classes for testing
export { MockPlaceDataService, BigQueryPlaceDataService };
export type { PlaceData, PlaceDataService } from "./_types";
