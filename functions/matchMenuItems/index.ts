import {
  graphql,
  type ItemTypeValue,
} from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, requireAuth } from "../_utils/auth-middleware";
import {
  calculateEnhancedConfidence,
  determineMatchReason,
} from "../_utils/item-matching/confidence-scoring";
import {
  shouldVerifyWithAI,
  verifyMatchesWithAI,
} from "../_utils/item-matching/ai-verification";
import { searchRecipesByVector } from "../_utils/item-matching/recipe-search";
import { calculateStringSimilarity } from "../_utils/item-matching/search-utils";
import { searchSpecificItems } from "../_utils/item-matching/specific-search";
import type {
  ItemMatchRequest,
  SearchResult,
} from "../_utils/item-matching/types";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";

import type {
  MatchMenuItemsRequest,
  MatchResult,
  MenuItemData,
} from "./_types";

const VALID_ITEM_TYPES = [
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
  "cocktail",
] as const;

const ITEM_TYPE_SUGGESTION_COLUMN: Record<string, string> = {
  wine: "suggested_wine_id",
  beer: "suggested_beer_id",
  spirit: "suggested_spirit_id",
  coffee: "suggested_coffee_id",
  sake: "suggested_sake_id",
  cocktail: "suggested_recipe_id",
};

export default async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate authentication first
  const authResult = requireAuth(req);
  if (authResult.isAuthenticated === false) {
    console.error("[matchMenuItems] Authentication failed:", authResult.error);
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  const {
    menuItemId,
    placeId,
    batchProcess = false,
  }: MatchMenuItemsRequest = req.body;

  if (!menuItemId && !placeId) {
    return res
      .status(400)
      .json({ error: "Must provide either menuItemId or placeId" });
  }

  try {
    // Get menu items to process
    let menuItems: MenuItemData[] = [];

    if (menuItemId) {
      // Process single item
      const itemData = await functionQuery(
        graphql(`
          query GetMenuItem($id: uuid!) {
            place_menu_items_by_pk(id: $id) {
              id
              menu_item_name
              menu_item_description
              detected_item_type
              confidence_score
              extracted_attributes
            }
          }
        `),
        { id: menuItemId },
        { headers: getAdminAuthHeaders() },
      );

      if (itemData.place_menu_items_by_pk) {
        const menuItem = itemData.place_menu_items_by_pk;
        if (menuItem && typeof menuItem.extracted_attributes === "object") {
          menuItems.push({
            ...menuItem,
            extracted_attributes:
              (menuItem.extracted_attributes as Record<string, unknown>) || {},
          });
        }
      }
    } else if (placeId) {
      // Process all unmatched items for a place.
      // Note: cocktails don't have a direct FK on place_menu_items — they
      // match via item_match_suggestions.suggested_recipe_id. This filter
      // only excludes items with direct FK matches, so cocktails will
      // always be included for (re-)matching, which is the desired behavior
      // since their match state lives in the suggestions table.
      const itemsData = await functionQuery(
        graphql(`
          query GetUnmatchedMenuItems($placeId: uuid!, $itemTypes: [String!]!) {
            place_menu_items(
              where: {
                place_id: { _eq: $placeId }
                wine_id: { _is_null: true }
                beer_id: { _is_null: true }
                spirit_id: { _is_null: true }
                coffee_id: { _is_null: true }
                sake_id: { _is_null: true }
                detected_item_type: { _in: $itemTypes }
              }
            ) {
              id
              menu_item_name
              menu_item_description
              detected_item_type
              confidence_score
              extracted_attributes
            }
          }
        `),
        { placeId, itemTypes: VALID_ITEM_TYPES },
        { headers: getAdminAuthHeaders() },
      );

      menuItems = (itemsData.place_menu_items || []).map((item) => ({
        ...item,
        extracted_attributes: (typeof item.extracted_attributes === "object"
          ? item.extracted_attributes
          : {}) as Record<string, unknown>,
      }));
    }

    if (menuItems.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No menu items to process",
        results: [],
      });
    }

    const results: MatchResult[] = [];

    // Process each menu item
    for (const menuItem of menuItems) {
      const matches = await findMatches(menuItem);
      results.push({
        menuItemId: menuItem.id,
        matches,
      });

      // Save match suggestions to database
      if (matches.length > 0) {
        const suggestions = matches
          .slice(0, 5)
          .filter((match) => ITEM_TYPE_SUGGESTION_COLUMN[match.itemType])
          .map((match) => ({
            place_menu_item_id: menuItem.id,
            [ITEM_TYPE_SUGGESTION_COLUMN[match.itemType]]: match.itemId,
            confidence_score: match.confidence,
            match_reasoning: match.reasoning,
            similarity_metrics: match.similarityMetrics,
          }));

        // Clear existing suggestions for this menu item
        await functionMutation(
          graphql(`
            mutation ClearExistingSuggestions($menuItemId: uuid!) {
              delete_item_match_suggestions(
                where: { place_menu_item_id: { _eq: $menuItemId } }
              ) {
                affected_rows
              }
            }
          `),
          { menuItemId: menuItem.id },
          { headers: getAdminAuthHeaders() },
        );

        // Insert new suggestions
        if (suggestions.length > 0) {
          await functionMutation(
            graphql(`
              mutation CreateMatchSuggestions($suggestions: [item_match_suggestions_insert_input!]!) {
                insert_item_match_suggestions(objects: $suggestions) {
                  affected_rows
                }
              }
            `),
            { suggestions },
            { headers: getAdminAuthHeaders() },
          );
        }
      }
    }

    const totalMatches = results.reduce(
      (sum, result) => sum + result.matches.length,
      0,
    );
    const highConfidenceMatches = results.reduce(
      (sum, result) =>
        sum + result.matches.filter((match) => match.confidence > 0.8).length,
      0,
    );

    res.json({
      success: true,
      itemsProcessed: menuItems.length,
      totalMatches,
      highConfidenceMatches,
      results: batchProcess ? [] : results,
    });
  } catch (error) {
    console.error("Item matching error:", error);
    res.status(500).json({
      error: "Failed to match menu items",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Find matches for a menu item using vector similarity search.
 *
 * 1. Build search text from menu item name + description + attributes
 * 2. Call searchSpecificItems() for vector/text similarity search
 * 3. Score results with calculateEnhancedConfidence() for attribute boosts
 * 4. Return top matches above confidence threshold
 */
async function findMatches(menuItem: MenuItemData): Promise<
  Array<{
    itemId: string;
    itemType: string;
    confidence: number;
    reasoning: string;
    similarityMetrics: {
      nameScore: number;
      attributeScore: number;
      overallScore: number;
    };
  }>
> {
  const {
    detected_item_type: itemType,
    menu_item_name: name,
    menu_item_description: description,
    extracted_attributes: attributes,
  } = menuItem;

  if (!VALID_ITEM_TYPES.includes(itemType)) {
    return [];
  }

  // Build search text from all available menu item data
  const searchTerms = buildMenuItemSearchTerms(name, description, attributes);

  // Branch: cocktails search recipe_vectors, others search item_vectors
  let searchResults: SearchResult[];

  if (itemType === "cocktail") {
    searchResults = await searchRecipesByVector(searchTerms, 10, 0.5);
  } else {
    const filters = buildFiltersFromAttributes(itemType, attributes);
    searchResults = await searchSpecificItems({
      itemType: itemType.toUpperCase() as ItemTypeValue,
      searchTerms,
      filters,
      limit: 10,
      similarityThreshold: 0.5,
    });
  }

  if (searchResults.length === 0) {
    return [];
  }

  // Keep a lookup map for AI verification candidate details
  const searchResultMap = new Map(searchResults.map((r) => [r.id, r]));

  // Build an ItemMatchRequest for enhanced confidence scoring
  const matchRequest = buildMatchRequest(name, itemType, attributes);

  // Score each result with enhanced confidence
  const matches = searchResults.map((result) => {
    const enhancedConfidence = calculateEnhancedConfidence(
      matchRequest,
      result,
    );
    const matchReason = determineMatchReason(matchRequest, result);

    // Compute name similarity for the similarityMetrics breakdown
    const nameScore = calculateStringSimilarity(
      name.toLowerCase(),
      result.name.toLowerCase(),
    );
    const baseScore = result.similarity_score ?? 0;
    const attributeBoost = enhancedConfidence - baseScore;

    return {
      itemId: result.id,
      itemType,
      confidence: enhancedConfidence,
      reasoning: formatMatchReasoning(
        matchReason,
        nameScore,
        enhancedConfidence,
      ),
      similarityMetrics: {
        nameScore,
        attributeScore: Math.max(0, attributeBoost),
        overallScore: enhancedConfidence,
      },
    };
  });

  // Pre-filter and sort for AI verification
  const sortedMatches = matches
    .filter((m) => m.confidence > 0.4)
    .sort((a, b) => b.confidence - a.confidence);

  // AI verification for ambiguous matches (0.4–0.9 confidence band)
  if (
    shouldVerifyWithAI(sortedMatches[0]?.confidence ?? 0, sortedMatches.length)
  ) {
    const verification = await verifyMatchesWithAI(
      {
        name,
        search_name: attributes.search_name as string | undefined,
        description,
        itemType,
        attributes,
      },
      sortedMatches.slice(0, 5).map((m) => {
        const sr = searchResultMap.get(m.itemId);
        return {
          id: m.itemId,
          name: sr?.name ?? "",
          brand_name: sr?.brand_name,
          country: sr?.country,
          vintage: sr?.vintage,
          style: sr?.style as string | undefined,
          variety: sr?.variety as string | undefined,
          alcohol_content_percentage: sr?.alcohol_content_percentage,
          originalConfidence: m.confidence,
        };
      }),
    );

    // Apply AI-adjusted confidence scores
    for (const candidate of verification.candidates) {
      const match = sortedMatches.find((m) => m.itemId === candidate.id);
      if (match) {
        match.confidence = candidate.adjustedConfidence;
        match.similarityMetrics.overallScore = candidate.adjustedConfidence;
        if (verification.bestMatchId === candidate.id) {
          match.reasoning = `AI verified: ${verification.reasoning}`;
        }
      }
    }
  }

  // Final filter, sort, and return
  return sortedMatches
    .filter((match) => match.confidence > 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

/**
 * Build search text from menu item data for embedding generation.
 */
function buildMenuItemSearchTerms(
  name: string,
  description: string | undefined,
  attributes: Record<string, unknown>,
): string {
  // Prefer AI-generated search_name for better embedding quality
  const primaryName =
    typeof attributes.search_name === "string" &&
    attributes.search_name.trim().length > 0
      ? attributes.search_name
      : name;
  const parts: string[] = [primaryName];

  if (description) {
    parts.push(description);
  }

  // Add key attribute values as search context
  const attributeKeys = [
    "variety",
    "style",
    "vintage",
    "brewery",
    "distillery",
    "roaster",
    "origin",
    "region",
    "country",
    "producer",
    "winery",
    "grape",
  ];

  for (const key of attributeKeys) {
    const value = attributes[key];
    if (value && typeof value === "string") {
      parts.push(value);
    }
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Build filter parameters from extracted attributes for the search query.
 */
function buildFiltersFromAttributes(
  itemType: string,
  attributes: Record<string, unknown>,
): {
  category?: string;
  country?: string;
  alcohol_content?: number;
  vintage?: string;
  style?: string;
  variety?: string;
} {
  const filters: Record<string, string | number | undefined> = {};

  if (typeof attributes.country === "string") {
    filters.country = attributes.country;
  }

  switch (itemType) {
    case "wine":
      if (typeof attributes.vintage === "string")
        filters.vintage = attributes.vintage;
      if (typeof attributes.variety === "string")
        filters.variety = attributes.variety;
      if (typeof attributes.style === "string")
        filters.style = attributes.style;
      break;
    case "beer":
      if (typeof attributes.style === "string")
        filters.style = attributes.style;
      break;
    case "spirit":
      if (typeof attributes.style === "string")
        filters.style = attributes.style;
      break;
    case "coffee":
      if (typeof attributes.style === "string")
        filters.style = attributes.style;
      break;
    case "sake":
      if (typeof attributes.style === "string")
        filters.style = attributes.style;
      if (typeof attributes.variety === "string")
        filters.variety = attributes.variety;
      break;
  }

  return filters;
}

/**
 * Build an ItemMatchRequest from menu item data for confidence scoring.
 */
function buildMatchRequest(
  name: string,
  itemType: string,
  attributes: Record<string, unknown>,
): ItemMatchRequest {
  // "COCKTAIL" is not a valid ItemTypeValue — use "generic" for confidence
  // scoring so calculateEnhancedConfidence falls through to default handling
  const upperType = itemType.toUpperCase();
  const itemTypeValue: ItemTypeValue | "generic" =
    upperType === "COCKTAIL" ? "generic" : (upperType as ItemTypeValue);

  return {
    name,
    item_type: itemTypeValue,
    brand_name: (attributes.brewery ??
      attributes.distillery ??
      attributes.winery ??
      attributes.roaster ??
      attributes.producer) as string | undefined,
    country: attributes.country as string | undefined,
    vintage: attributes.vintage as string | undefined,
    style: (attributes.style ?? attributes.cocktail_style) as
      | string
      | undefined,
    variety: attributes.variety as string | undefined,
    alcohol_content: attributes.alcohol_content as number | undefined,
    region: attributes.region as string | undefined,
    category: attributes.category as string | undefined,
    description: (attributes.description ?? attributes.ingredients) as
      | string
      | undefined,
  };
}

/**
 * Format the match reasoning into a human-readable string.
 */
function formatMatchReasoning(
  matchReason: string,
  nameScore: number,
  confidence: number,
): string {
  const reasons: string[] = [];

  switch (matchReason) {
    case "exact_name":
      reasons.push("Exact name match");
      break;
    case "exact_brand":
      reasons.push("Exact brand match");
      break;
    case "brand_similarity":
      reasons.push("Brand similarity");
      break;
    case "category_match":
      reasons.push("Category match");
      break;
    case "semantic_similarity":
      reasons.push("Semantic similarity");
      break;
  }

  if (nameScore > 0.8 && matchReason !== "exact_name") {
    reasons.push("Strong name similarity");
  } else if (nameScore > 0.6 && matchReason !== "exact_name") {
    reasons.push("Moderate name similarity");
  }

  if (confidence > 0.8) {
    reasons.push("High overall confidence");
  }

  return reasons.length > 0 ? reasons.join(", ") : "Vector similarity match";
}
