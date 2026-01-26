import { BigQuery } from "@google-cloud/bigquery";
import type { PlaceData, PlaceDataService } from "./_types";

export class BigQueryPlaceDataService implements PlaceDataService {
  private bigquery: BigQuery;

  constructor() {
    this.bigquery = new BigQuery({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    });
  }

  async fetchPlaces(categories: string[]): Promise<PlaceData[]> {
    console.log(
      `[BigQueryPlaceDataService] Fetching data for ${categories.length} categories from Overture Maps`,
    );

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
        ARRAY_TO_STRING(phones.list, ', ') as phone,
        websites[OFFSET(0)] as website,
        brand.names.primary as brand_name
      FROM \`bigquery-public-data.overture_maps.place\`
      WHERE 
        confidence >= 0.7
        AND categories.primary IN UNNEST(@categories)
      ORDER BY confidence DESC, primary_category
    `;

    const [rows] = await this.bigquery.query({
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
