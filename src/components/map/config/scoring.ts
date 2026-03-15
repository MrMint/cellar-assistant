import type {
  ItemType,
  MapSearchParams,
  PlaceCategory,
  PlaceResult,
} from "../types";
import { ITEM_TYPE_CATEGORY_MAPPINGS } from "./categories";
import { NAME_KEYWORDS } from "./keywords";

// Identity score threshold for SQL pre-filtering.
// Categories with identityScore >= this value are sent to the database query.
const IDENTITY_THRESHOLD = 0.5;

// Extended place type for scoring that includes optional menu data
interface ScoringPlace extends PlaceResult {
  menu_summary?: { total_items: number };
}

// Calculate overall place quality independent of search criteria
export function calculateOverallQuality(place: ScoringPlace): number {
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

// Calculate item type matching scores for ALL item types using identityScore
export function calculateItemTypeMatches(
  place: PlaceResult,
): Record<ItemType, number> {
  const allItemTypes: ItemType[] = ["wine", "beer", "spirit", "coffee", "sake"];
  const scores: Record<ItemType, number> = {
    wine: 0,
    beer: 0,
    spirit: 0,
    coffee: 0,
    sake: 0,
  };

  // 1. Name-based keyword detection
  const placeName = place.name?.toLowerCase() || "";

  Object.entries(NAME_KEYWORDS).forEach(([itemType, keywords]) => {
    const hasNameMatch = keywords.some((keyword) =>
      placeName.includes(keyword),
    );
    if (hasNameMatch) {
      scores[itemType as ItemType] += 25;
    }
  });

  // 2. Category-based scoring using identityScore with primary category bonus
  const categories = place.categories || [place.primary_category];

  allItemTypes.forEach((itemType) => {
    const mappings = ITEM_TYPE_CATEGORY_MAPPINGS[itemType] || [];
    let bestScore = 0;

    categories.forEach((category: string, index: number) => {
      const isPrimary = index === 0 || category === place.primary_category;
      const multiplier = isPrimary ? 1.5 : 1.0;

      mappings.forEach((mapping) => {
        if (category === mapping.category) {
          const adjustedScore = mapping.identityScore * multiplier;
          bestScore = Math.max(bestScore, adjustedScore);
        }
      });
    });

    // Convert to 0-100 scale
    const categoryScore = Math.min(100, Math.round(bestScore * 100));
    scores[itemType] += categoryScore;

    // Cap at 100
    scores[itemType] = Math.min(100, scores[itemType]);
  });

  return scores;
}

// Calculate overall relevance score based on all active filters
export function calculateOverallRelevance(
  searchParams: MapSearchParams,
  itemTypeScores: Record<ItemType, number>,
): number {
  const { itemTypes = [] } = searchParams;

  if (itemTypes.length === 0) {
    return 100; // Default relevance when no item type filters
  }

  const relevantScores = itemTypes
    .map((type: ItemType) => itemTypeScores[type] || 0)
    .filter((score: number) => score > 0);

  if (relevantScores.length === 0) {
    return 5; // Very low relevance for non-matching places
  }

  return Math.max(...relevantScores);
}

export function mapItemTypesToCategories(
  itemTypes: ItemType[],
): PlaceCategory[] | undefined {
  if (itemTypes.length === 0) {
    return undefined; // No filtering when no item types selected
  }

  // Include categories where identityScore meets threshold.
  // This naturally varies per item type: coffee only passes coffee_shop/cafe/roastery,
  // while spirits includes bars, lounges, pubs, etc.
  const categorySet = new Set<PlaceCategory>();
  itemTypes.forEach((itemType) => {
    ITEM_TYPE_CATEGORY_MAPPINGS[itemType]?.forEach((mapping) => {
      if (mapping.identityScore >= IDENTITY_THRESHOLD) {
        categorySet.add(mapping.category);
      }
    });
  });

  return Array.from(categorySet);
}
