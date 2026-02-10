"use server";

import { graphql } from "@cellar-assistant/shared/gql";
import { createNhostClient } from "@/lib/nhost/server";
import { serverMutation, serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

// =============================================================================
// Types
// =============================================================================

export interface MenuScanUploadResult {
  success: boolean;
  scanId?: string;
  error?: string;
}

export interface MenuScanStatus {
  id: string;
  processing_status: "pending" | "processing" | "completed" | "failed";
  items_detected: number | null;
  items_matched: number | null;
  confidence_score: number | null;
  processing_error: string | null;
  place_id: string | null;
}

export interface MenuScanFullResult {
  scan: {
    id: string;
    processing_status: string;
    items_detected: number | null;
    confidence_score: number | null;
    place_id: string | null;
    place: { id: string; name: string } | null;
    scanned_at: string | null;
  };
  items: Array<{
    id: string;
    menu_item_name: string;
    menu_item_description: string | null;
    menu_item_price: number | null;
    menu_category: string | null;
    detected_item_type: string | null;
    confidence_score: number | null;
    extracted_attributes: Record<string, unknown> | null;
    wine: { id: string; name: string } | null;
    beer: { id: string; name: string } | null;
    spirit: { id: string; name: string } | null;
    coffee: { id: string; name: string } | null;
  }>;
}

export interface MenuScanSummary {
  id: string;
  processing_status: string;
  items_detected: number | null;
  confidence_score: number | null;
  scanned_at: string | null;
  processed_at: string | null;
  place: { id: string; name: string } | null;
}

/**
 * Extract {id, name} from a gql.tada masked relation object.
 * gql.tada returns opaque types for nested selections; this helper
 * safely narrows them without per-field `as` casts.
 */
function extractIdName(obj: unknown): { id: string; name: string } | null {
  if (
    obj &&
    typeof obj === "object" &&
    "id" in obj &&
    "name" in obj &&
    typeof (obj as Record<string, unknown>).id === "string" &&
    typeof (obj as Record<string, unknown>).name === "string"
  ) {
    return {
      id: (obj as Record<string, unknown>).id as string,
      name: (obj as Record<string, unknown>).name as string,
    };
  }
  return null;
}

// =============================================================================
// GraphQL Operations
// =============================================================================

const CreateMenuScanMutation = graphql(`
  mutation CreateMenuScanServerAction($scan: menu_scans_insert_input!) {
    insert_menu_scans_one(object: $scan) {
      id
      processing_status
    }
  }
`);

const GetMenuScanStatusQuery = graphql(`
  query GetMenuScanStatus($scanId: uuid!) {
    menu_scans_by_pk(id: $scanId) {
      id
      processing_status
      items_detected
      items_matched
      confidence_score
      processing_error
      place_id
    }
  }
`);

const GetMenuScanResultsQuery = graphql(`
  query GetMenuScanResults($scanId: uuid!) {
    menu_scans_by_pk(id: $scanId) {
      id
      processing_status
      items_detected
      confidence_score
      place_id
      scanned_at
      place {
        id
        name
      }
    }
    place_menu_items(
      where: { menu_scan_id: { _eq: $scanId } }
      order_by: { menu_category: asc, menu_item_name: asc }
    ) {
      id
      menu_item_name
      menu_item_description
      menu_item_price
      menu_category
      detected_item_type
      confidence_score
      extracted_attributes
      wine {
        id
        name
      }
      beer {
        id
        name
      }
      spirit {
        id
        name
      }
      coffee {
        id
        name
      }
    }
  }
`);

const GetUserScanHistoryQuery = graphql(`
  query GetUserScanHistory {
    menu_scans(order_by: { created_at: desc }, limit: 50) {
      id
      processing_status
      items_detected
      confidence_score
      scanned_at
      processed_at
      place {
        id
        name
      }
    }
  }
`);

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Upload a menu image and trigger processing.
 * Returns immediately with a scanId — client polls for status.
 */
export async function uploadAndProcessMenuScan(
  formData: FormData,
): Promise<MenuScanUploadResult> {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const fileEntry = formData.get("file");
    if (!fileEntry || !(fileEntry instanceof File)) {
      return { success: false, error: "No file provided" };
    }
    const file = fileEntry;
    const placeId = formData.get("placeId") as string;

    if (!placeId) {
      return { success: false, error: "No place ID provided" };
    }

    // Upload image to Nhost storage
    const nhost = await createNhostClient();
    const uploadResult = await nhost.storage.uploadFiles({
      "file[]": [file],
      "bucket-id": "default",
    });

    const {
      body: {
        processedFiles: [fileMetadata],
      },
      status,
    } = uploadResult;

    if (status < 200 || status >= 300) {
      return { success: false, error: `Upload failed with status ${status}` };
    }

    if (!fileMetadata?.id) {
      return { success: false, error: "No file ID returned from upload" };
    }

    // Create menu scan record
    const scanResult = await serverMutation(CreateMenuScanMutation, {
      scan: {
        user_id: userId,
        place_id: placeId,
        original_image_id: fileMetadata.id,
        processing_status: "pending",
      },
    });

    const scanId = scanResult.insert_menu_scans_one?.id;
    if (!scanId) {
      return { success: false, error: "Failed to create scan record" };
    }

    // Trigger processing function and verify it was accepted
    const nhostFunctionUrl = process.env.NHOST_FUNCTION_URL;
    if (!nhostFunctionUrl) {
      console.error("NHOST_FUNCTION_URL is not configured");
      return { success: false, error: "Server configuration error" };
    }

    try {
      const processResponse = await fetch(
        `${nhostFunctionUrl}/v1/functions/processMenuScan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "nhost-webhook-secret": process.env.NHOST_WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({ scanId, userId }),
        },
      );

      if (!processResponse.ok) {
        console.error(`processMenuScan returned ${processResponse.status}`);
        return {
          success: false,
          error: "Failed to start menu processing",
          scanId,
        };
      }
    } catch (fetchError) {
      console.error("Failed to trigger processMenuScan:", fetchError);
      return {
        success: false,
        error: "Failed to connect to processing service",
        scanId,
      };
    }

    return { success: true, scanId };
  } catch (error) {
    console.error("Menu scan upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Poll the current status of a menu scan.
 * Called periodically by the client to track processing progress.
 */
export async function getMenuScanStatus(
  scanId: string,
): Promise<MenuScanStatus | null> {
  try {
    const userId = await getServerUserId();
    if (!userId) return null;

    const data = await serverQuery(GetMenuScanStatusQuery, { scanId });
    const scan = data.menu_scans_by_pk;

    if (!scan) return null;

    return {
      id: scan.id,
      processing_status:
        scan.processing_status as MenuScanStatus["processing_status"],
      items_detected: scan.items_detected ?? null,
      items_matched: scan.items_matched ?? null,
      confidence_score: scan.confidence_score ?? null,
      processing_error: scan.processing_error ?? null,
      place_id: scan.place_id ?? null,
    };
  } catch (error) {
    console.error("Failed to get scan status:", error);
    return null;
  }
}

/**
 * Get full scan results including extracted items.
 * Used by the MenuScanResults page.
 */
export async function getScanResults(
  scanId: string,
): Promise<MenuScanFullResult | null> {
  try {
    const userId = await getServerUserId();
    if (!userId) return null;

    const data = await serverQuery(GetMenuScanResultsQuery, { scanId });
    const scan = data.menu_scans_by_pk;

    if (!scan) return null;

    return {
      scan: {
        id: scan.id,
        processing_status: scan.processing_status,
        items_detected: scan.items_detected ?? null,
        confidence_score: scan.confidence_score ?? null,
        place_id: scan.place_id ?? null,
        place: extractIdName(scan.place),
        scanned_at: scan.scanned_at ?? null,
      },
      items: (data.place_menu_items ?? []).map((item) => ({
        id: item.id,
        menu_item_name: item.menu_item_name,
        menu_item_description: item.menu_item_description ?? null,
        menu_item_price: item.menu_item_price ?? null,
        menu_category: item.menu_category ?? null,
        detected_item_type: item.detected_item_type ?? null,
        confidence_score: item.confidence_score ?? null,
        extracted_attributes:
          (item.extracted_attributes as Record<string, unknown>) ?? null,
        wine: extractIdName(item.wine),
        beer: extractIdName(item.beer),
        spirit: extractIdName(item.spirit),
        coffee: extractIdName(item.coffee),
      })),
    };
  } catch (error) {
    console.error("Failed to get scan results:", error);
    return null;
  }
}

/**
 * Get the current user's scan history.
 */
export async function getUserScanHistory(): Promise<MenuScanSummary[]> {
  try {
    const userId = await getServerUserId();
    if (!userId) return [];

    const data = await serverQuery(GetUserScanHistoryQuery);

    return (data.menu_scans ?? []).map((scan) => ({
      id: scan.id,
      processing_status: scan.processing_status,
      items_detected: scan.items_detected ?? null,
      confidence_score: scan.confidence_score ?? null,
      scanned_at: scan.scanned_at ?? null,
      processed_at: scan.processed_at ?? null,
      place: extractIdName(scan.place),
    }));
  } catch (error) {
    console.error("Failed to get scan history:", error);
    return [];
  }
}
