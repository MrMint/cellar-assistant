import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { AUTH_ERROR_RESPONSE, requireAuth } from "../_utils/auth-middleware";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";
import { buildMenuExtractionPrompt, MENU_EXTRACTION_SCHEMA } from "./_prompts";
import type { ExtractedMenuItem, MenuScanRequest } from "./_types";

// Types and prompts are imported from local modules

export default async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate authentication first
  const authResult = requireAuth(req);
  if (authResult.isAuthenticated === false) {
    console.error(
      "🚫 [processMenuScan] Authentication failed:",
      authResult.error,
    );
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  const { scanId, userId }: MenuScanRequest = req.body;

  if (!scanId || !userId) {
    return res.status(400).json({ error: "Missing scanId or userId" });
  }

  try {
    // Update scan status to processing
    const updateStatusMutation = graphql(`
      mutation UpdateScanStatus($scanId: uuid!) {
        update_menu_scans_by_pk(
          pk_columns: { id: $scanId }
          _set: {
            processing_status: "processing"
          }
        ) {
          id
        }
      }
    `);

    await functionMutation(
      updateStatusMutation,
      { scanId },
      {
        headers: getAdminAuthHeaders(),
      },
    );

    // Get scan details with image
    const getScanQuery = graphql(`
      query GetMenuScan($scanId: uuid!) {
        menu_scans_by_pk(id: $scanId) {
          id
          user_id
          place_id
          original_image_id
          place {
            id
            name
            categories
          }
        }
      }
    `);

    const scanData = await functionQuery(
      getScanQuery,
      { scanId },
      {
        headers: getAdminAuthHeaders(),
      },
    );

    if (!scanData?.menu_scans_by_pk) {
      throw new Error("Scan not found");
    }

    const scan = scanData.menu_scans_by_pk;

    if (scan.user_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Single-pass vision extraction: send the menu image directly to AI
    // with structured output schema, preserving visual context (layout,
    // section headers, formatting) that would be lost in a two-step
    // OCR-then-parse approach.
    if (!scan.original_image_id) {
      throw new Error("No image available for processing");
    }

    const imageUrl = `${process.env.NHOST_STORAGE_URL}/files/${scan.original_image_id}`;
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Extract place context for the prompt
    const placeName =
      scan.place &&
      typeof scan.place === "object" &&
      "name" in scan.place &&
      scan.place.name
        ? String(scan.place.name)
        : undefined;
    const placeCategories =
      scan.place &&
      typeof scan.place === "object" &&
      "categories" in scan.place &&
      Array.isArray(scan.place.categories)
        ? (scan.place.categories as string[])
        : undefined;

    console.log("Processing menu image with single-pass vision extraction...");
    const aiProvider = await createAIProvider();
    const aiResult = await aiProvider.generateContent({
      prompt: buildMenuExtractionPrompt(placeName, placeCategories),
      images: [imageBuffer],
      schema: MENU_EXTRACTION_SCHEMA,
    });

    let extractedItems: ExtractedMenuItem[];
    try {
      const parsed: unknown = JSON.parse(aiResult.content);
      if (!Array.isArray(parsed)) {
        throw new Error("AI response is not an array");
      }
      // Validate each item defensively — AI structured output compliance varies
      extractedItems = parsed.filter((item): item is ExtractedMenuItem => {
        if (typeof item !== "object" || item === null) return false;
        const obj = item as Record<string, unknown>;
        return (
          typeof obj.name === "string" &&
          obj.name.length > 0 &&
          typeof obj.search_name === "string" &&
          typeof obj.itemType === "string" &&
          typeof obj.confidence === "number"
        );
      });
    } catch (parseError) {
      console.error("Failed to parse AI vision response:", parseError);
      throw new Error("Failed to parse menu extraction results");
    }

    // Store the raw JSON as extracted_text for audit/debugging
    const extractedText = aiResult.content;
    const saveTextMutation = graphql(`
      mutation SaveExtractedText($scanId: uuid!, $text: String!) {
        update_menu_scans_by_pk(
          pk_columns: { id: $scanId }
          _set: { extracted_text: $text }
        ) {
          id
        }
      }
    `);
    await functionMutation(
      saveTextMutation,
      { scanId, text: extractedText },
      { headers: getAdminAuthHeaders() },
    );

    // Filter and validate items
    const validItemTypes = [
      "wine",
      "beer",
      "spirit",
      "coffee",
      "sake",
      "cocktail",
    ];
    const validItems = extractedItems.filter(
      (item) =>
        item.name &&
        item.itemType &&
        item.confidence >= 0.7 &&
        validItemTypes.includes(item.itemType),
    );

    // Create menu items in database
    if (validItems.length > 0) {
      // Find or create a current place_menu record so items are visible in the UI
      let placeMenuId: string | null = null;

      const getCurrentMenuQuery = graphql(`
        query GetCurrentPlaceMenu($placeId: uuid!) {
          place_menus(
            where: { place_id: { _eq: $placeId }, is_current: { _eq: true } }
            limit: 1
          ) {
            id
          }
        }
      `);

      try {
        const menuData = await functionQuery(
          getCurrentMenuQuery,
          { placeId: scan.place_id },
          { headers: getAdminAuthHeaders() },
        );

        if (menuData?.place_menus?.[0]?.id) {
          placeMenuId = menuData.place_menus[0].id;
          console.log(`Using existing place_menu: ${placeMenuId}`);
        } else {
          // Create a new place_menu record
          const createMenuMutation = graphql(`
            mutation CreatePlaceMenu($menu: place_menus_insert_input!) {
              insert_place_menus_one(object: $menu) {
                id
              }
            }
          `);

          const newMenu = await functionMutation(
            createMenuMutation,
            {
              menu: {
                place_id: scan.place_id,
                source: "camera_scan",
                is_current: true,
                created_by: userId,
                discovered_at: "now()",
              },
            },
            { headers: getAdminAuthHeaders() },
          );

          placeMenuId = newMenu?.insert_place_menus_one?.id ?? null;
          console.log(`Created new place_menu: ${placeMenuId}`);
        }
      } catch (menuError) {
        console.error("Failed to find/create place_menu:", menuError);
        // Continue without place_menu_id — items will still be created
      }

      const menuItemObjects = validItems.map((item) => ({
        menu_scan_id: scanId,
        place_id: scan.place_id,
        ...(placeMenuId ? { place_menu_id: placeMenuId } : {}),
        menu_item_name: item.name,
        menu_item_description: item.description,
        menu_item_price: item.price ? parsePrice(item.price) : null,
        menu_category: item.category,
        detected_item_type: item.itemType,
        confidence_score: item.confidence,
        extracted_attributes: {
          ...item.attributes,
          search_name: item.search_name,
        },
        is_available: true,
      }));

      const createItemsMutation = graphql(`
        mutation CreateScannedMenuItems($items: [place_menu_items_insert_input!]!) {
          insert_place_menu_items(objects: $items) {
            affected_rows
            returning {
              id
              menu_item_name
              detected_item_type
            }
          }
        }
      `);

      try {
        await functionMutation(
          createItemsMutation,
          { items: menuItemObjects },
          {
            headers: getAdminAuthHeaders(),
          },
        );
      } catch (error) {
        console.error("Failed to save menu items:", error);

        // Mark scan as failed since items were not persisted
        try {
          await functionMutation(
            graphql(`
              mutation FailScanItemInsertion($scanId: uuid!, $error: String!) {
                update_menu_scans_by_pk(
                  pk_columns: { id: $scanId }
                  _set: {
                    processing_status: "failed"
                    processed_at: "now()"
                    processing_error: $error
                  }
                ) {
                  id
                }
              }
            `),
            {
              scanId,
              error: `Failed to save menu items: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
            { headers: getAdminAuthHeaders() },
          );
        } catch (updateError) {
          console.error(
            "Failed to update scan to failed status after item insertion error:",
            updateError,
          );
        }

        return res.status(500).json({
          error: "Failed to save menu items",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update scan status to completed with retry to avoid stuck "processing" state
    const completeMutation = graphql(`
      mutation CompleteScanProcessing($scanId: uuid!, $itemsDetected: Int!, $confidence: numeric) {
        update_menu_scans_by_pk(
          pk_columns: { id: $scanId }
          _set: {
            processing_status: "completed"
            processed_at: "now()"
            items_detected: $itemsDetected
            confidence_score: $confidence
          }
        ) {
          id
        }
      }
    `);

    const completionVars = {
      scanId,
      itemsDetected: validItems.length,
      confidence:
        validItems.length > 0
          ? validItems.reduce((sum, item) => sum + item.confidence, 0) /
            validItems.length
          : 0,
    };

    let completionSucceeded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await functionMutation(completeMutation, completionVars, {
          headers: getAdminAuthHeaders(),
        });
        completionSucceeded = true;
        break;
      } catch (error) {
        console.error(
          `Failed to update scan completion (attempt ${attempt + 1}/3):`,
          error,
        );
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (attempt + 1)),
          );
        }
      }
    }

    if (!completionSucceeded) {
      console.error(
        `CRITICAL: Scan ${scanId} stuck in "processing" — all completion retries failed. Items detected: ${validItems.length}. Manual intervention required.`,
      );
    }

    // Note: Item matching is triggered automatically via Hasura event trigger
    // on menu_scans when processing_status changes to "completed"

    res.json({
      success: true,
      scanId,
      itemsDetected: validItems.length,
      confidenceScore:
        validItems.length > 0
          ? validItems.reduce((sum, item) => sum + item.confidence, 0) /
            validItems.length
          : 0,
      extractedText: extractedText.substring(0, 500), // Truncate for response
      itemTypes: validItems.reduce(
        (acc, item) => {
          acc[item.itemType] = (acc[item.itemType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
  } catch (error) {
    console.error("Menu scan processing error:", error);

    // Update scan status to failed
    const failMutation = graphql(`
      mutation FailScanProcessing($scanId: uuid!, $error: String!) {
        update_menu_scans_by_pk(
          pk_columns: { id: $scanId }
          _set: {
            processing_status: "failed"
            processed_at: "now()"
            processing_error: $error
          }
        ) {
          id
        }
      }
    `);

    try {
      await functionMutation(
        failMutation,
        {
          scanId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        {
          headers: getAdminAuthHeaders(),
        },
      );
    } catch (updateError) {
      console.error("Failed to update scan to failed status:", updateError);
    }

    res.status(500).json({
      error: "Failed to process menu scan",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

function parsePrice(priceString: string): number | null {
  // Extract numeric price from string like "$12.50", "€15", "£8.99", etc.
  const match = priceString.match(/[\d,]+\.?\d*/);
  if (match) {
    const numericPrice = parseFloat(match[0].replace(/,/g, ""));
    return Number.isNaN(numericPrice) ? null : numericPrice;
  }
  return null;
}
