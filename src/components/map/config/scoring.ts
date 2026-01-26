import type { ItemType, MapSearchParams, PlaceCategory } from "../types";
import { ITEM_TYPE_CATEGORY_MAPPINGS } from "./categories";
import { NAME_KEYWORDS } from "./keywords";

// Calculate overall place quality independent of search criteria
export function calculateOverallQuality(place: any): number {
  let score = 0;
  let maxScore = 0;

  // Rating quality (30% weight)
  maxScore += 30;
  if (place.rating && place.rating > 0) {
    // Scale rating 1-5 to 0-30
    score += (place.rating / 5.0) * 30;
  } else {
    // No rating = average quality assumption
    score += 15;
  }

  // Menu items availability (25% weight)
  maxScore += 25;
  if (place.menu_summary?.total_items) {
    const menuItems = place.menu_summary.total_items;
    if (menuItems >= 50) score += 25;
    else if (menuItems >= 20) score += 20;
    else if (menuItems >= 10) score += 15;
    else if (menuItems >= 5) score += 10;
    else score += 5;
  } else {
    // No menu data = average assumption
    score += 12;
  }

  // Verification status (20% weight)
  maxScore += 20;
  if (place.is_verified === true) {
    score += 20;
  } else if (place.is_verified === false) {
    score += 8; // Unverified but in system
  } else {
    score += 12; // Unknown verification = average
  }

  // Review count (15% weight) - estimated from rating availability
  maxScore += 15;
  if (place.rating && place.rating >= 4.0) {
    score += 15; // High rating implies good reviews
  } else if (place.rating && place.rating >= 3.0) {
    score += 10;
  } else if (place.rating) {
    score += 5;
  } else {
    score += 8; // No rating = average
  }

  // Confidence/data quality (10% weight)
  maxScore += 10;
  if (place.confidence && place.confidence > 0.8) {
    score += 10;
  } else if (place.confidence && place.confidence > 0.6) {
    score += 7;
  } else if (place.confidence && place.confidence > 0.4) {
    score += 4;
  } else if (place.confidence) {
    score += 2;
  } else {
    score += 6; // No confidence data = average
  }

  const qualityScore = Math.round((score / maxScore) * 100);
  return Math.min(100, Math.max(0, qualityScore));
}

// Calculate item type matching scores for ALL item types (enhanced with name keywords and primary category weighting)
export function calculateItemTypeMatches(
  place: any,
  _requestedItemTypes?: ItemType[],
  socialFilter?: boolean,
): Record<ItemType, number> {
  // Always calculate for ALL item types, not just requested ones
  const allItemTypes: ItemType[] = ["wine", "beer", "spirit", "coffee", "sake"];
  // Initialize all scores
  const scores: Record<ItemType, number> = {
    wine: 0,
    beer: 0,
    spirit: 0,
    coffee: 0,
    sake: 0,
  };

  // 1. Enhanced name-based keyword detection (non-brand keywords only)
  const placeName = place.name?.toLowerCase() || "";

  // Track which item types get name bonuses (more selective)
  const nameMatches: Record<string, boolean> = {};
  Object.entries(NAME_KEYWORDS).forEach(([itemType, keywords]) => {
    const hasNameMatch = keywords.some((keyword) =>
      placeName.includes(keyword),
    );
    if (hasNameMatch) {
      nameMatches[itemType] = true;
      scores[itemType as ItemType] += 25; // Reduced from 60 to 25 - name gives bonus, not dominance
    }
  });

  // 2. Category-based scoring with primary category weighting
  const categories = place.categories || [place.primary_category];

  allItemTypes.forEach((itemType) => {
    const categoryWeights = ITEM_TYPE_CATEGORY_MAPPINGS[itemType] || [];
    let bestMatchWeight = 0;

    categories.forEach((category: any, index: number) => {
      const isPrimary = index === 0 || category === place.primary_category;
      const multiplier = isPrimary ? 1.5 : 1.0; // 50% bonus for primary category

      // Check each category weight for this item type
      categoryWeights.forEach((categoryWeight) => {
        const isMatch = category === categoryWeight.category;

        if (isMatch) {
          const adjustedWeight = categoryWeight.weight * multiplier;
          bestMatchWeight = Math.max(bestMatchWeight, adjustedWeight);
        }
      });
    });

    // Convert weight (0.0-1.5) to percentage (0-150, then cap at 100)
    const categoryScore = Math.min(100, Math.round(bestMatchWeight * 100));
    scores[itemType] += categoryScore;

    // Apply social filtering
    if (socialFilter === true) {
      // Check if this place has destination scores indicating it's social across ALL item types
      let isSocialPlace = false;
      let maxDestinationScore = 0;

      // Check ALL item types for social scoring, not just the current one
      const allItemTypes: ItemType[] = [
        "wine",
        "beer",
        "spirit",
        "coffee",
        "sake",
      ];
      allItemTypes.forEach((checkItemType) => {
        const categoryWeights =
          ITEM_TYPE_CATEGORY_MAPPINGS[checkItemType] || [];
        categories.forEach((category: any) => {
          const categoryWeight = categoryWeights.find(
            (cw) => cw.category === category,
          );
          if (categoryWeight?.destinationScore) {
            maxDestinationScore = Math.max(
              maxDestinationScore,
              categoryWeight.destinationScore,
            );
            if (categoryWeight.destinationScore >= 0.6) {
              isSocialPlace = true;
            }
          }
        });
      });

      if (isSocialPlace) {
        // Give social places a baseline score even if they don't match item type criteria
        const baselineScore = Math.round(maxDestinationScore * 50); // 0.6-1.0 destination → 30-50 baseline
        scores[itemType] = Math.max(scores[itemType], baselineScore);

        // Keep social places at their natural score (no boost)
      } else {
        // Reduce score for non-social places when social filter is active
        scores[itemType] = Math.round(scores[itemType] * 0.2); // Dramatically reduce score for non-social places
      }
    }

    // Cap final score at 100
    scores[itemType] = Math.min(100, scores[itemType]);
  });

  return scores;
}

// Legacy function - calculate server-side relevance score and matched item types using weighted categories
export function calculatePlaceRelevance(
  place: any,
  searchParams: MapSearchParams,
): { relevanceScore: number; matchedItemTypes: ItemType[] } {
  const {
    itemTypes = [],
    minRating,
    visitStatuses = [],
    semanticQuery,
    socialFilter,
  } = searchParams;

  let score = 0;
  let maxScore = 0;
  const matchedItemTypes: ItemType[] = [];

  // Enhanced item type matching (40% weight) using Overture-based weights
  if (itemTypes.length > 0) {
    maxScore += 40;

    itemTypes.forEach((itemType) => {
      const categoryWeights = ITEM_TYPE_CATEGORY_MAPPINGS[itemType] || [];
      let bestMatchWeight = 0;
      let hasMatch = false;

      // Check each category for this item type
      categoryWeights.forEach((categoryWeight) => {
        const isMatch =
          place.categories?.includes(categoryWeight.category) ||
          place.primary_category === categoryWeight.category;

        if (isMatch) {
          hasMatch = true;
          let adjustedWeight = categoryWeight.weight;

          // Apply social scoring multiplier if social filtering is active
          if (socialFilter === true && categoryWeight.destinationScore) {
            const destScore = categoryWeight.destinationScore;
            if (destScore >= 0.6) {
              // Keep social places at their natural weight (no boost)
            } else {
              // Apply penalty based on how non-social the place is
              // destScore 0.0-0.59 → penalty multiplier 0.1-0.59 (lower destScore = higher penalty)
              const penaltyMultiplier = Math.max(0.1, destScore);
              adjustedWeight *= penaltyMultiplier;
            }
          }

          bestMatchWeight = Math.max(bestMatchWeight, adjustedWeight);
        }
      });

      if (hasMatch) {
        // Score based on the weight of the best matching category
        // Higher weights (like winery for wine) get higher scores
        const itemScore = (40 / itemTypes.length) * bestMatchWeight;
        score += itemScore;
        matchedItemTypes.push(itemType);
      }
    });
  }

  // Rating match (30% weight)
  if (minRating && minRating > 0) {
    maxScore += 30;
    if (place.rating && place.rating >= minRating) {
      score += 30;
    }
  }

  // Menu summary relevance (20% weight)
  if (place.menu_summary) {
    maxScore += 20;
    const totalItems = place.menu_summary.total_items || 0;
    if (totalItems > 0) {
      // Give higher scores to places with more menu items
      score += Math.min(20, totalItems / 2);
    }
  }

  // Search query relevance (10% weight) - for semantic search
  if (semanticQuery) {
    maxScore += 10;
    // This would typically use the confidence score from semantic search
    score += 10; // Assume semantic matches are relevant
  }

  const relevanceScore =
    maxScore > 0 ? Math.round((score / maxScore) * 100) : 100;
  const finalScore = Math.min(100, Math.max(0, relevanceScore));

  return { relevanceScore: finalScore, matchedItemTypes };
}

// Calculate overall relevance score based on all active filters
export function calculateOverallRelevance(
  searchParams: MapSearchParams,
  itemTypeScores: Record<ItemType, number>,
): number {
  const { itemTypes = [], socialFilter = false } = searchParams;

  // Base logic: if no filters are active, everyone gets default relevance
  if (!socialFilter && itemTypes.length === 0) {
    return 100; // Default relevance when no filters
  }

  // If only social filter is active (no item types selected)
  if (socialFilter && itemTypes.length === 0) {
    // Use the highest score among all item types for social-only filtering
    const allScores = (Object.values(itemTypeScores) as number[]).filter(
      (score: number) => score > 0,
    );
    if (allScores.length === 0) {
      return 25; // Very low relevance for places with no social relevance
    }
    return Math.max(...allScores);
  }

  // If item types are selected (with or without social filter)
  if (itemTypes.length > 0) {
    const relevantScores = itemTypes
      .map((type: ItemType) => itemTypeScores[type] || 0)
      .filter((score: number) => score > 0);

    if (relevantScores.length === 0) {
      return 25; // Very low relevance for places that don't match selected item types
    }

    // Use the highest score among selected item types
    return Math.max(...relevantScores);
  }

  return 100; // Fallback
}

// Get weighted categories for more sophisticated relevance scoring
export function getWeightedCategoriesForItemTypes(
  itemTypes: ItemType[],
): Map<PlaceCategory, number> {
  const weightMap = new Map<PlaceCategory, number>();

  itemTypes.forEach((itemType) => {
    ITEM_TYPE_CATEGORY_MAPPINGS[itemType]?.forEach((categoryWeight) => {
      const existing = weightMap.get(categoryWeight.category) || 0;
      // Use the higher weight if category appears in multiple item types
      weightMap.set(
        categoryWeight.category,
        Math.max(existing, categoryWeight.weight),
      );
    });
  });

  return weightMap;
}

export function mapItemTypesToCategories(
  itemTypes: ItemType[],
): PlaceCategory[] | undefined {
  if (itemTypes.length === 0) {
    return undefined; // No filtering when no item types selected
  }

  const categorySet = new Set<PlaceCategory>();
  itemTypes.forEach((itemType) => {
    ITEM_TYPE_CATEGORY_MAPPINGS[itemType]?.forEach((categoryWeight) => {
      categorySet.add(categoryWeight.category);
    });
  });

  return Array.from(categorySet);
}
