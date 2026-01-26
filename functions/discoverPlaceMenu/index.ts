import { graphql, ITEM_TYPES } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { AUTH_ERROR_RESPONSE, requireAuth } from "../_utils/auth-middleware";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";

// Lowercase version for AI prompts and GraphQL filters (legacy format)
const ITEM_TYPES_LOWERCASE = ITEM_TYPES.map((t) => t.toLowerCase());

import type { ExtractedMenuItem, MenuDiscoveryRequest } from "./_types";
import {
  determineMenuType,
  parsePrice,
  validateMenuDiscoveryRequest,
} from "./_types";

// Interfaces now imported from ./types.ts

export default async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate authentication first
  const authResult = requireAuth(req);
  if (authResult.isAuthenticated === false) {
    console.error(
      "🚫 [discoverPlaceMenu] Authentication failed:",
      authResult.error,
    );
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  let validatedRequest: MenuDiscoveryRequest;
  try {
    validatedRequest = validateMenuDiscoveryRequest(req.body);
  } catch (validationError) {
    return res.status(400).json({
      error: "Invalid request",
      details:
        validationError instanceof Error
          ? validationError.message
          : "Unknown validation error",
    });
  }

  const { placeId } = validatedRequest;
  // Use authenticated userId from auth validation
  const userId = authResult.userId;

  try {
    const GET_PLACE_FOR_MENU_DISCOVERY = graphql(`
      query GetPlaceForMenuDiscovery($id: uuid!) {
        places_by_pk(id: $id) {
          id
          name
          website
          categories
          primary_category
          phone
        }
      }
    `);
    // Get place details
    const placeData = await functionQuery(
      GET_PLACE_FOR_MENU_DISCOVERY,
      { id: placeId },
      { headers: getAdminAuthHeaders() },
    );

    if (!placeData?.places_by_pk) {
      return res.status(404).json({ error: "Place not found" });
    }

    const place = placeData.places_by_pk;

    if (!place.website) {
      return res.status(400).json({
        error: "No website available for menu discovery",
        place: place.name,
      });
    }

    // Fetch website content
    console.log(`Fetching menu from ${place.website}`);

    let websiteContent = "";
    try {
      const response = await fetch(place.website, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CellarAssistant/1.0; +https://cellar-assistant.com/bot)",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      websiteContent = await response.text();
    } catch (fetchError) {
      console.error("Failed to fetch website:", fetchError);
      return res.status(400).json({
        error: "Failed to fetch website content",
        details:
          fetchError instanceof Error ? fetchError.message : "Unknown error",
      });
    }

    // Extract menu information using AI
    const menuPrompt = `
      You are a specialized menu extraction AI. Extract detailed menu information from this ${place.primary_category || "restaurant"} website.

      Restaurant: ${place.name}
      Categories: ${place.categories?.join(", ")}
      Website Content: ${websiteContent.substring(0, 50000)}

      Focus ONLY on these beverage types:
      - WINES: Extract name, vintage, variety/grape, region, winery, price
      - BEERS: Extract name, brewery, style, ABV, IBU, price
      - SPIRITS: Extract name, distillery, type (whiskey/rum/vodka/gin/etc), age, proof, price
      - COFFEES: Extract name, roaster, origin, roast level, processing method, price
      - SAKE: Extract name, brewery, category (junmai/ginjo/etc), polish ratio, SMV, price

      For each item, determine:
      1. Item type (${ITEM_TYPES_LOWERCASE.join("/")}/unknown)
      2. Confidence level (0.0-1.0)
      3. Extract relevant attributes based on type
      4. Menu category (wine list, beer menu, cocktails, coffee, sake, etc.)

      Return ONLY a valid JSON array with this exact structure:
      [
        {
          "name": "Item name",
          "description": "Menu description (optional)",
          "price": "Price as string if found",
          "category": "Menu section name",
          "itemType": "${ITEM_TYPES_LOWERCASE.join("|")}|unknown",
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
      Maximum 100 items.
    `;

    console.log("Extracting menu items with AI...");
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
      console.error("AI Response:", aiResponse);
      return res.status(500).json({
        error: "Failed to parse menu extraction results",
        details: "AI response was not valid JSON",
      });
    }

    // Filter and validate items
    const validItems = extractedItems.filter(
      (item) =>
        item.name &&
        item.itemType &&
        item.confidence >= 0.7 &&
        ITEM_TYPES_LOWERCASE.includes(item.itemType),
    );

    if (validItems.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No relevant beverage items found on menu",
        itemsFound: 0,
        menuId: null,
      });
    }

    // Create menu record
    const menuData = {
      items: validItems,
      extractedAt: new Date().toISOString(),
      totalItems: validItems.length,
      source: place.website,
      categories: Array.from(new Set(validItems.map((item) => item.category))),
    };

    const CREATE_PLACE_MENU = graphql(`
      mutation CreatePlaceMenu($menu: place_menus_insert_input!) {
        insert_place_menus_one(
          object: $menu
          on_conflict: {
            constraint: idx_place_menus_current_unique
            update_columns: [
              menu_data, 
              confidence_score, 
              discovered_at, 
              updated_at,
              version
            ]
          }
        ) {
          id
          version
        }
      }
    `);

    const menuResult = await functionMutation(
      CREATE_PLACE_MENU,
      {
        menu: {
          place_id: placeId,
          menu_data: menuData,
          menu_type: determineMenuType(place.categories),
          source: "web_scrape",
          source_url: place.website,
          discovery_method: "ai_extraction",
          confidence_score:
            validItems.reduce((sum, item) => sum + item.confidence, 0) /
            validItems.length,
          created_by: userId,
          is_current: true,
          version: 1,
        },
      },
      { headers: getAdminAuthHeaders() },
    );

    const menuId = menuResult?.insert_place_menus_one?.id;

    // Create individual menu items
    const menuItemObjects = validItems.map((item) => ({
      place_menu_id: menuId,
      place_id: placeId,
      menu_item_name: item.name,
      menu_item_description: item.description,
      menu_item_price: item.price ? parsePrice(item.price) : null,
      menu_category: item.category,
      detected_item_type: item.itemType,
      confidence_score: item.confidence,
      extracted_attributes: item.attributes,
      is_available: true,
    }));

    const CREATE_MENU_ITEMS = graphql(`
      mutation CreateMenuItems($items: [place_menu_items_insert_input!]!) {
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
        CREATE_MENU_ITEMS,
        { items: menuItemObjects },
        { headers: getAdminAuthHeaders() },
      );
    } catch (itemsError) {
      console.error("Failed to save menu items:", itemsError);
      // Menu is saved, but items failed - still return success
    }

    // Update place access tracking
    const UPDATE_PLACE_ACCESS = graphql(`
      mutation UpdatePlaceAccess($placeId: uuid!) {
        update_places_by_pk(
          pk_columns: { id: $placeId }
          _inc: { access_count: 1 }
          _set: { 
            last_accessed_at: "now()"
            first_cached_reason: "menu_discovery"
          }
        ) {
          id
        }
      }
    `);

    await functionMutation(
      UPDATE_PLACE_ACCESS,
      { placeId },
      { headers: getAdminAuthHeaders() },
    );

    res.json({
      success: true,
      menuId,
      itemsFound: validItems.length,
      itemsCreated: menuItemObjects.length,
      confidenceScore:
        validItems.reduce((sum, item) => sum + item.confidence, 0) /
        validItems.length,
      categories: Array.from(new Set(validItems.map((item) => item.category))),
      itemTypes: validItems.reduce(
        (acc, item) => {
          acc[item.itemType] = (acc[item.itemType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
  } catch (error) {
    console.error("Menu discovery error:", error);
    res.status(500).json({
      error: "Failed to discover menu",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
