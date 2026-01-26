// Category configuration for POI filtering based on Overture Maps analysis
// Generated from overture-category-analysis.md

export interface CategoryTier {
  tier: 1 | 2 | 3 | 4 | 5;
  categories: string[];
  cachePriority: "high" | "medium" | "low";
  queryRadius: number; // meters
  description: string;
  globalCount: number; // Total venues globally
}

export const CATEGORY_TIERS: Record<number, CategoryTier> = {
  1: {
    tier: 1,
    description: "Essential venues - Core targets for wine/beer/spirits/coffee",
    cachePriority: "high",
    queryRadius: 10000, // 10km
    globalCount: 3764570,
    categories: [
      "restaurant", // 1,508,464
      "bar", // 654,428
      "cafe", // 636,430
      "coffee_shop", // 616,583
      "liquor_store", // 149,961
      "winery", // 70,225
      "brewery", // 45,619
      "cocktail_bar", // 46,196
      "wine_bar", // 36,257
      "distillery", // 7,503
    ],
  },
  2: {
    tier: 2,
    description: "Specialized venues - Strong beverage focus",
    cachePriority: "high",
    queryRadius: 5000, // 5km
    globalCount: 398400,
    categories: [
      "pub", // 180,661
      "beer_bar", // 31,417
      "sports_bar", // 10,360
      "lounge", // 63,970
      "gastropub", // 21,439
      "tapas_bar", // 31,316
      "sake_bar", // 11,960
      "whiskey_bar", // 1,259
      "beer_garden", // 26,011
      "wine_tasting_room", // 151
      "coffee_roastery", // 173
    ],
  },
  3: {
    tier: 3,
    description: "Restaurant types - Known for good beverage selections",
    cachePriority: "medium",
    queryRadius: 3000, // 3km
    globalCount: 1329300,
    categories: [
      "steakhouse", // 62,792
      "italian_restaurant", // 156,883
      "french_restaurant", // 52,765
      "japanese_restaurant", // 275,364
      "sushi_restaurant", // 108,252
      "mexican_restaurant", // 174,910
      "thai_restaurant", // 110,627
      "chinese_restaurant", // 178,871
    ],
  },
  4: {
    tier: 4,
    description: "Retail venues - Selling alcoholic beverages and coffee",
    cachePriority: "medium",
    queryRadius: 5000, // 5km
    globalCount: 842230,
    categories: [
      "grocery_store", // 483,183
      "supermarket", // 318,351
      "specialty_grocery_store", // 5,851
      "organic_grocery_store", // 19,822
      "beer_wine_and_spirits", // 10,864
      "wine_wholesaler", // 1,150
      "beverage_store", // 1,956
    ],
  },
  5: {
    tier: 5,
    description: "Hotels/Entertainment - Venues containing bars/restaurants",
    cachePriority: "low",
    queryRadius: 10000, // 10km
    globalCount: 1514645,
    categories: [
      "hotel", // 1,422,090
      "resort", // 95,360
      "casino", // 34,167
      "music_venue", // 53,838
    ],
  },
};

export type CacheReason =
  | "user_view" // User viewed place details
  | "user_favorite" // User favorited place
  | "menu_scan" // Menu was scanned at this place
  | "user_interaction" // User rated/noted place
  | "proximity_frequent" // Frequently in user's area
  | "category_priority" // High-priority category (Tier 1-2)
  | "bulk_preload" // Area preloading
  | "discovery_search"; // Discovery mode search

export interface CachingPolicy {
  reason: CacheReason;
  priority: number; // 1-10, higher = more important
  ttl?: number; // Optional time-to-live in hours
  autoRefresh: boolean; // Auto-refresh from BigQuery
}

export const CACHING_POLICIES: Record<CacheReason, CachingPolicy> = {
  user_view: { reason: "user_view", priority: 7, ttl: 168, autoRefresh: false }, // 1 week
  user_favorite: { reason: "user_favorite", priority: 10, autoRefresh: true }, // Permanent
  menu_scan: { reason: "menu_scan", priority: 9, autoRefresh: true }, // Permanent
  user_interaction: {
    reason: "user_interaction",
    priority: 8,
    autoRefresh: true,
  }, // Permanent
  proximity_frequent: {
    reason: "proximity_frequent",
    priority: 6,
    ttl: 720,
    autoRefresh: true,
  }, // 30 days
  category_priority: {
    reason: "category_priority",
    priority: 5,
    ttl: 168,
    autoRefresh: false,
  }, // 1 week
  bulk_preload: {
    reason: "bulk_preload",
    priority: 3,
    ttl: 72,
    autoRefresh: false,
  }, // 3 days
  discovery_search: {
    reason: "discovery_search",
    priority: 4,
    ttl: 24,
    autoRefresh: false,
  }, // 1 day
};

export interface SearchContext {
  userLocation: [number, number];
  timeOfDay: "morning" | "afternoon" | "evening" | "late";
  userPreferences: string[];
  discoveryMode: boolean;
  radius?: number;
}

export class CategoryManager {
  /**
   * Get relevant categories based on context
   */
  getRelevantCategories(context: SearchContext): string[] {
    const categories = new Set<string>();

    // Always include Tier 1 essentials
    for (const cat of CATEGORY_TIERS[1].categories) {
      categories.add(cat);
    }

    // Time-based category additions
    if (context.timeOfDay === "morning") {
      categories.add("cafe");
      categories.add("coffee_shop");
      categories.add("coffee_roastery");
      categories.add("bakery");
    } else if (
      context.timeOfDay === "evening" ||
      context.timeOfDay === "late"
    ) {
      // Add Tier 2 specialized venues for evening
      for (const cat of CATEGORY_TIERS[2].categories) {
        categories.add(cat);
      }
    }

    // Discovery mode: include more categories
    if (context.discoveryMode) {
      for (const cat of CATEGORY_TIERS[2].categories) {
        categories.add(cat);
      }
      for (const cat of CATEGORY_TIERS[3].categories) {
        categories.add(cat);
      }
    }

    // User preference boost
    for (const pref of context.userPreferences) {
      categories.add(pref);
    }

    return Array.from(categories);
  }

  /**
   * Get categories by tier
   */
  getCategoriesByTier(tier: number): string[] {
    return CATEGORY_TIERS[tier]?.categories || [];
  }

  /**
   * Get all categories for a specific cache priority
   */
  getCategoriesByPriority(priority: "high" | "medium" | "low"): string[] {
    const categories: string[] = [];

    Object.values(CATEGORY_TIERS).forEach((tier) => {
      if (tier.cachePriority === priority) {
        categories.push(...tier.categories);
      }
    });

    return categories;
  }

  /**
   * Get tier information for a category
   */
  getCategoryTier(category: string): CategoryTier | null {
    for (const tier of Object.values(CATEGORY_TIERS)) {
      if (tier.categories.includes(category)) {
        return tier;
      }
    }
    return null;
  }

  /**
   * Get optimal query radius for given categories
   */
  getOptimalRadius(categories: string[]): number {
    let maxRadius = 1000; // Default 1km

    categories.forEach((category) => {
      const tier = this.getCategoryTier(category);
      if (tier && tier.queryRadius > maxRadius) {
        maxRadius = tier.queryRadius;
      }
    });

    return maxRadius;
  }

  /**
   * Get caching policy for a category and reason
   */
  getCachingPolicy(category: string, reason: CacheReason): CachingPolicy {
    const basePolicy = CACHING_POLICIES[reason];
    const tier = this.getCategoryTier(category);

    // Boost priority for high-tier categories
    if (tier && (tier.tier === 1 || tier.tier === 2)) {
      return {
        ...basePolicy,
        priority: Math.min(basePolicy.priority + 2, 10),
      };
    }

    return basePolicy;
  }

  /**
   * Get all essential categories (Tier 1 + 2)
   */
  getEssentialCategories(): string[] {
    return [...CATEGORY_TIERS[1].categories, ...CATEGORY_TIERS[2].categories];
  }

  /**
   * Get beverage-specific categories
   */
  getBeverageCategories(): {
    wine: string[];
    beer: string[];
    spirits: string[];
    coffee: string[];
    cocktails: string[];
  } {
    return {
      wine: [
        "wine_bar",
        "winery",
        "wine_tasting_room",
        "steakhouse",
        "italian_restaurant",
        "french_restaurant",
      ],
      beer: [
        "bar",
        "brewery",
        "beer_bar",
        "pub",
        "beer_garden",
        "sports_bar",
        "gastropub",
      ],
      spirits: [
        "bar",
        "distillery",
        "whiskey_bar",
        "cocktail_bar",
        "liquor_store",
        "lounge",
      ],
      coffee: ["cafe", "coffee_shop", "coffee_roastery"],
      cocktails: ["cocktail_bar", "lounge", "bar", "hotel", "resort"],
    };
  }
}

// Export singleton instance
export const categoryManager = new CategoryManager();
