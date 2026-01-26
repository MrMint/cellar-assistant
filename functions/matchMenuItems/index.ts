import { graphql, ITEM_TYPES } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { distance } from "fastest-levenshtein";
import { createFunctionNhostClient } from "../_utils";
import { AUTH_ERROR_RESPONSE, requireAuth } from "../_utils/auth-middleware";
import { isString } from "../_utils/types";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";

// Lowercase version for GraphQL queries (legacy format)
const ITEM_TYPES_LOWERCASE = ITEM_TYPES.map((t) => t.toLowerCase());

import type {
  DatabaseItem,
  ItemsByTypeResponse,
  MatchMenuItemsRequest,
  MatchResult,
  MenuItemData,
} from "./_types";

// All interfaces are now imported from ./types.ts

export default async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate authentication first
  const authResult = requireAuth(req);
  if (authResult.isAuthenticated === false) {
    console.error(
      "🚫 [matchMenuItems] Authentication failed:",
      authResult.error,
    );
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  const {
    menuItemId,
    placeId,
    batchProcess = false,
  }: MatchMenuItemsRequest = req.body;

  // Use authenticated userId from auth validation
  const _userId = authResult.userId;

  if (!menuItemId && !placeId) {
    return res
      .status(400)
      .json({ error: "Must provide either menuItemId or placeId" });
  }

  const nhost = createFunctionNhostClient();

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
      // Process all unmatched items for a place
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
        { placeId, itemTypes: ITEM_TYPES_LOWERCASE },
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
      const matches = await findMatches(menuItem, nhost);
      results.push({
        menuItemId: menuItem.id,
        matches,
      });

      // Save match suggestions to database
      if (matches.length > 0) {
        const suggestions = matches.slice(0, 5).map((match) => ({
          place_menu_item_id: menuItem.id,
          [`suggested_${match.itemType}_id`]: match.itemId,
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
      results: batchProcess ? [] : results, // Don't return full results for batch processing
    });
  } catch (error) {
    console.error("Item matching error:", error);
    res.status(500).json({
      error: "Failed to match menu items",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

async function findMatches(
  menuItem: MenuItemData,
  nhost: ReturnType<typeof createFunctionNhostClient>,
): Promise<
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
    extracted_attributes: attributes,
  } = menuItem;

  if (!ITEM_TYPES_LOWERCASE.includes(itemType)) {
    return [];
  }

  // Get candidate items from database
  const candidates = await getCandidateItems(itemType, name, attributes, nhost);

  if (candidates.length === 0) {
    return [];
  }

  // Calculate similarity scores
  const matches = candidates.map((candidate) => {
    const nameScore = calculateNameSimilarity(name, candidate.name);
    const attributeScore = calculateAttributeSimilarity(
      itemType,
      attributes,
      candidate,
    );
    const overallScore = nameScore * 0.6 + attributeScore * 0.4;

    return {
      itemId: candidate.id,
      itemType,
      confidence: overallScore,
      reasoning: generateMatchReasoning(
        nameScore,
        attributeScore,
        itemType,
        attributes,
        candidate,
      ),
      similarityMetrics: {
        nameScore,
        attributeScore,
        overallScore,
      },
    };
  });

  // Return matches above threshold, sorted by confidence
  return matches
    .filter((match) => match.confidence > 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

async function getCandidateItems(
  itemType: string,
  name: string,
  attributes: Record<string, unknown>,
  _nhost: ReturnType<typeof createFunctionNhostClient>,
): Promise<DatabaseItem[]> {
  const _tableName = `${itemType}s`;

  // Build query based on item type - dynamic query selection requires flexible typing
  // Each query has different variable requirements based on item type
  let query: ReturnType<typeof graphql>;
  let variables: Record<string, unknown> = {};

  switch (itemType) {
    case "wine":
      query = graphql(`
        query FindWineCandidates($namePattern: String, $vintage: Int, $variety: String) {
          wines(
            where: {
              _or: [
                { name: { _ilike: $namePattern } }
                { 
                  _and: [
                    { vintage: { _eq: $vintage } }
                    { variety: { _eq: $variety } }
                  ]
                }
              ]
            }
            limit: 50
          ) {
            id
            name
            vintage
            variety
            winery_id
            region
            alcohol_content_percentage
          }
        }
      `);
      variables = {
        namePattern: `%${name.split(" ").join("%")}%`,
        vintage: attributes.vintage,
        variety: attributes.variety,
      };
      break;

    case "beer":
      query = graphql(`
        query FindBeerCandidates($namePattern: String, $brewery: String, $style: String) {
          beers(
            where: {
              _or: [
                { name: { _ilike: $namePattern } }
                { brewery: { _ilike: $brewery } }
                { style: { _eq: $style } }
              ]
            }
            limit: 50
          ) {
            id
            name
            brewery
            style
            alcohol_content_percentage
            international_bitterness_unit
            vintage
          }
        }
      `);
      variables = {
        namePattern: `%${name.split(" ").join("%")}%`,
        brewery: attributes.brewery ? `%${attributes.brewery}%` : null,
        style: attributes.style,
      };
      break;

    case "spirit":
      query = graphql(`
        query FindSpiritCandidates($namePattern: String, $distillery: String, $age: Int) {
          spirits(
            where: {
              _or: [
                { name: { _ilike: $namePattern } }
                { distillery: { _ilike: $distillery } }
                { age: { _eq: $age } }
              ]
            }
            limit: 50
          ) {
            id
            name
            distillery
            age
            alcohol_content_percentage
            type {
              name
            }
          }
        }
      `);
      variables = {
        namePattern: `%${name.split(" ").join("%")}%`,
        distillery: attributes.distillery ? `%${attributes.distillery}%` : null,
        age: attributes.age,
      };
      break;

    case "coffee":
      query = graphql(`
        query FindCoffeeCandidates($namePattern: String, $roaster: String, $origin: String) {
          coffees(
            where: {
              _or: [
                { name: { _ilike: $namePattern } }
                { roaster: { _ilike: $roaster } }
                { origin: { _eq: $origin } }
              ]
            }
            limit: 50
          ) {
            id
            name
            roaster
            origin
            roast_level
            processing_method
          }
        }
      `);
      variables = {
        namePattern: `%${name.split(" ").join("%")}%`,
        roaster: attributes.roaster ? `%${attributes.roaster}%` : null,
        origin: attributes.origin,
      };
      break;
  }

  // Dynamic query with runtime-determined variables - type assertion required for flexible matching
  const data = await functionQuery(
    query,
    variables as Parameters<typeof functionQuery>[1],
    { headers: getAdminAuthHeaders() },
  );

  // Type-safe access to the data based on item type
  const typedData = data as ItemsByTypeResponse;
  switch (itemType) {
    case "wine":
      return typedData.wines || [];
    case "beer":
      return typedData.beers || [];
    case "spirit":
      return typedData.spirits || [];
    case "coffee":
      return typedData.coffees || [];
    default:
      return [];
  }
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const norm1 = normalize(name1);
  const norm2 = normalize(name2);

  // Exact match
  if (norm1 === norm2) return 1.0;

  // Levenshtein distance
  const maxLen = Math.max(norm1.length, norm2.length);
  const dist = distance(norm1, norm2);
  const levenScore = Math.max(0, 1 - dist / maxLen);

  // Token overlap
  const tokens1 = new Set(norm1.split(" "));
  const tokens2 = new Set(norm2.split(" "));
  const intersection = new Set(
    Array.from(tokens1).filter((x) => tokens2.has(x)),
  );
  const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);
  const tokenScore = intersection.size / union.size;

  // Combined score
  return levenScore * 0.6 + tokenScore * 0.4;
}

function calculateAttributeSimilarity(
  itemType: string,
  menuAttrs: Record<string, any>,
  dbItem: DatabaseItem,
): number {
  const relevantAttrs: Record<string, string[]> = {
    wine: ["vintage", "variety", "region", "alcohol_content_percentage"],
    beer: [
      "brewery",
      "style",
      "alcohol_content_percentage",
      "international_bitterness_unit",
    ],
    spirit: ["distillery", "age", "alcohol_content_percentage", "type"],
    coffee: ["roaster", "origin", "roast_level", "processing_method"],
  };

  const attrs = relevantAttrs[itemType] || [];
  let matchCount = 0;
  let totalAttrs = 0;

  for (const attr of attrs) {
    const menuValue = menuAttrs[attr];
    const dbValue = dbItem[attr] || dbItem[attr.replace("_", "")]; // Handle naming differences

    if (menuValue != null && dbValue != null) {
      totalAttrs++;

      if (typeof menuValue === "string" && typeof dbValue === "string") {
        if (normalize(menuValue) === normalize(dbValue)) {
          matchCount++;
        }
      } else if (menuValue === dbValue) {
        matchCount++;
      } else if (typeof menuValue === "number" && typeof dbValue === "number") {
        // Allow for small numeric differences
        if (Math.abs(menuValue - dbValue) <= 0.5) {
          matchCount++;
        }
      }
    }
  }

  return totalAttrs > 0 ? matchCount / totalAttrs : 0;
}

function generateMatchReasoning(
  nameScore: number,
  attributeScore: number,
  itemType: string,
  menuAttrs: Record<string, any>,
  dbItem: DatabaseItem,
): string {
  const reasons: string[] = [];

  if (nameScore > 0.8) {
    reasons.push("Strong name similarity");
  } else if (nameScore > 0.6) {
    reasons.push("Moderate name similarity");
  }

  if (attributeScore > 0.8) {
    reasons.push("High attribute match");
  } else if (attributeScore > 0.6) {
    reasons.push("Partial attribute match");
  }

  // Add specific matches
  switch (itemType) {
    case "wine":
      if (menuAttrs.vintage === dbItem.vintage) reasons.push("Vintage match");
      if (
        menuAttrs.variety &&
        isString(dbItem.variety) &&
        normalize(menuAttrs.variety) === normalize(dbItem.variety)
      ) {
        reasons.push("Grape variety match");
      }
      break;
    case "beer":
      if (
        menuAttrs.brewery &&
        isString(dbItem.brewery) &&
        normalize(menuAttrs.brewery) === normalize(dbItem.brewery)
      ) {
        reasons.push("Brewery match");
      }
      if (menuAttrs.style === dbItem.style) reasons.push("Style match");
      break;
    case "spirit":
      if (
        menuAttrs.distillery &&
        isString(dbItem.distillery) &&
        normalize(menuAttrs.distillery) === normalize(dbItem.distillery)
      ) {
        reasons.push("Distillery match");
      }
      if (menuAttrs.age === dbItem.age) reasons.push("Age match");
      break;
    case "coffee":
      if (
        menuAttrs.roaster &&
        isString(dbItem.roaster) &&
        normalize(menuAttrs.roaster) === normalize(dbItem.roaster)
      ) {
        reasons.push("Roaster match");
      }
      if (menuAttrs.origin === dbItem.origin) reasons.push("Origin match");
      break;
  }

  return reasons.length > 0 ? reasons.join(", ") : "Basic similarity detected";
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
