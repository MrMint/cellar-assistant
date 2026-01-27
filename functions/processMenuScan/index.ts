import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { AUTH_ERROR_RESPONSE, requireAuth } from "../_utils/auth-middleware";
import { createFunctionNhostClient } from "../_utils/index";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";
import type { ExtractedMenuItem, MenuScanRequest } from "./_types";

// All interfaces are now imported from ./types.ts

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

  const _nhost = createFunctionNhostClient();

  try {
    // Update scan status to processing
    const updateStatusMutation = graphql(`
      mutation UpdateScanStatus($scanId: uuid!) {
        update_menu_scans_by_pk(
          pk_columns: { id: $scanId }
          _set: { 
            processing_status: "processing"
            processing_started_at: "now()"
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
          extracted_text
          place {
            id
            name
            categories
            primary_category
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

    let extractedText = scan.extracted_text;

    // If no text extracted yet, perform OCR on the image
    if (!extractedText && scan.original_image_id) {
      // Get image URL from storage
      const _imageUrl = `${process.env.NHOST_STORAGE_URL}/files/${scan.original_image_id}`;

      // Use Google AI Vision for OCR
      const ocrPrompt = `
        Extract ALL text from this menu image. Return ONLY the raw text exactly as it appears, 
        preserving the layout and structure as much as possible. Do not add any formatting, 
        interpretation, or analysis - just the literal text from the image.
      `;

      try {
        const aiProvider = await createAIProvider();
        const aiResult = await aiProvider.generateContent({
          prompt: ocrPrompt,
        });
        extractedText = aiResult.content;
        // TODO: Add image input support when available

        // Save extracted text
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
          {
            headers: getAdminAuthHeaders(),
          },
        );
      } catch (ocrError) {
        console.error("OCR failed:", ocrError);
        extractedText = "OCR processing failed - manual review required";
      }
    }

    // Process extracted text to identify menu items
    const menuPrompt = `
      You are a specialized menu analysis AI. Analyze this extracted menu text and identify beverage items.

      ${scan.place && typeof scan.place === "object" && "name" in scan.place && scan.place.name ? `Restaurant: ${scan.place.name}` : ""}
      ${scan.place && typeof scan.place === "object" && "categories" in scan.place && Array.isArray(scan.place.categories) ? `Categories: ${scan.place.categories.join(", ")}` : ""}
      
      Menu Text:
      ${extractedText}

      Focus ONLY on these beverage types:
      - WINES: Extract name, vintage, variety/grape, region, winery, price
      - BEERS: Extract name, brewery, style, ABV, IBU, price  
      - SPIRITS: Extract name, distillery, type (whiskey/rum/vodka/gin/etc), age, proof, price
      - COFFEES: Extract name, roaster, origin, roast level, processing method, price

      For each item, determine:
      1. Item type (wine/beer/spirit/coffee/unknown)
      2. Confidence level (0.0-1.0) 
      3. Extract relevant attributes based on type
      4. Menu category/section

      Return ONLY a valid JSON array with this exact structure:
      [
        {
          "name": "Item name",
          "description": "Menu description (optional)",
          "price": "Price as string if found",
          "category": "Menu section name", 
          "itemType": "wine|beer|spirit|coffee|unknown",
          "confidence": 0.85,
          "attributes": {
            // Include only relevant attributes for the item type
            "vintage": 2020,
            "variety": "Pinot Noir",
            "region": "Burgundy"
          }
        }
      ]

      Skip food items, non-alcoholic beverages (except coffee), and other non-relevant items.
      Only include items with confidence >= 0.7.
      Maximum 50 items.
    `;

    console.log("Processing menu text with AI...");
    const aiProvider = await createAIProvider();
    const aiResult = await aiProvider.generateContent({
      prompt: menuPrompt,
    });
    const aiResponse = aiResult.content;

    let extractedItems: ExtractedMenuItem[];
    try {
      extractedItems = JSON.parse(aiResponse);

      if (!Array.isArray(extractedItems)) {
        throw new Error("AI response is not an array");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Failed to parse menu analysis results");
    }

    // Filter and validate items
    const validItems = extractedItems.filter(
      (item) =>
        item.name &&
        item.itemType &&
        item.confidence >= 0.7 &&
        ["wine", "beer", "spirit", "coffee", "sake"].includes(item.itemType),
    );

    // Create menu items in database
    if (validItems.length > 0) {
      const menuItemObjects = validItems.map((item) => ({
        menu_scan_id: scanId,
        place_id: scan.place_id,
        menu_item_name: item.name,
        menu_item_description: item.description,
        menu_item_price: item.price ? parsePrice(item.price) : null,
        menu_category: item.category,
        detected_item_type: item.itemType,
        confidence_score: item.confidence,
        extracted_attributes: item.attributes,
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
      }
    }

    // Update scan status to completed
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

    try {
      await functionMutation(
        completeMutation,
        {
          scanId,
          itemsDetected: validItems.length,
          confidence:
            validItems.length > 0
              ? validItems.reduce((sum, item) => sum + item.confidence, 0) /
                validItems.length
              : 0,
        },
        {
          headers: getAdminAuthHeaders(),
        },
      );
    } catch (error) {
      console.error("Failed to update scan completion:", error);
    }

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
    const numericPrice = parseFloat(match[0].replace(",", ""));
    return Number.isNaN(numericPrice) ? null : numericPrice;
  }
  return null;
}
