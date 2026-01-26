import type { CategoryWeight, ItemType } from "../types";

// Enhanced item-type to category mapping based on Overture Maps analysis
// Each category has a weight indicating likelihood of finding the item type
export const ITEM_TYPE_CATEGORY_MAPPINGS: Record<ItemType, CategoryWeight[]> = {
  wine: [
    // Tier 1: Primary wine venues (95%+ likelihood)
    { category: "winery", weight: 0.98, tier: 1, destinationScore: 0.95 },
    { category: "wine_bar", weight: 0.95, tier: 1, destinationScore: 0.8 },
    {
      category: "wine_tasting_room",
      weight: 0.97,
      tier: 1,
      destinationScore: 0.9,
    },

    // Tier 2: Upscale venues with wine focus (80-90% likelihood)
    { category: "cocktail_bar", weight: 0.85, tier: 2, destinationScore: 0.75 },
    { category: "lounge", weight: 0.82, tier: 2, destinationScore: 0.75 },
    { category: "gastropub", weight: 0.8, tier: 2, destinationScore: 0.7 },

    // Tier 3: General dining/drinking venues (40% likelihood - most restaurants aren't wine specialists)
    { category: "restaurant", weight: 0.4, tier: 3, destinationScore: 0.55 },
    { category: "bar", weight: 0.75, tier: 2, destinationScore: 0.75 }, // Above 0.70 threshold
    { category: "tapas_bar", weight: 0.73, tier: 2, destinationScore: 0.75 }, // Above 0.70 threshold

    // Tier 4: Retail venues (60-70% likelihood)
    { category: "liquor_store", weight: 0.65, tier: 3, destinationScore: 0.15 },
    {
      category: "wine_wholesaler",
      weight: 0.75,
      tier: 2,
      destinationScore: 0.2,
    }, // Above 0.70 threshold
    {
      category: "beer_wine_and_spirits",
      weight: 0.85,
      tier: 1,
      destinationScore: 0.15,
    }, // Specialist wine retailer

    // Tier 5: Cuisine-specific restaurants (70-85% likelihood)
    { category: "steakhouse", weight: 0.85, tier: 2, destinationScore: 0.7 }, // High wine focus
    {
      category: "italian_restaurant",
      weight: 0.82,
      tier: 2,
      destinationScore: 0.6,
    }, // Wine focus
    {
      category: "french_restaurant",
      weight: 0.88,
      tier: 2,
      destinationScore: 0.65,
    }, // Premium wine focus
    {
      category: "japanese_restaurant",
      weight: 0.75,
      tier: 2,
      destinationScore: 0.6,
    }, // Above 0.70 threshold
    {
      category: "sushi_restaurant",
      weight: 0.78,
      tier: 2,
      destinationScore: 0.65,
    }, // Above 0.70 threshold

    // Tier 6: Entertainment venues (50-65% likelihood)
    { category: "hotel", weight: 0.6, tier: 3, destinationScore: 0.4 },
    { category: "resort", weight: 0.65, tier: 3, destinationScore: 0.85 },
    { category: "casino", weight: 0.58, tier: 3, destinationScore: 0.45 },

    // Tier 7: Grocery retail (40-60% likelihood)
    { category: "grocery_store", weight: 0.45, tier: 3, destinationScore: 0.1 },
    { category: "supermarket", weight: 0.48, tier: 3, destinationScore: 0.1 },
    {
      category: "specialty_grocery_store",
      weight: 0.55,
      tier: 3,
      destinationScore: 0.2,
    },
    {
      category: "organic_grocery_store",
      weight: 0.52,
      tier: 3,
      destinationScore: 0.15,
    },
  ],

  beer: [
    // Tier 1: Primary beer venues (90%+ likelihood)
    { category: "brewery", weight: 0.98, tier: 1, destinationScore: 0.9 },
    { category: "beer_bar", weight: 0.95, tier: 1, destinationScore: 0.8 },
    { category: "beer_garden", weight: 0.93, tier: 1, destinationScore: 0.85 },
    { category: "pub", weight: 0.9, tier: 1, destinationScore: 0.75 },

    // Tier 2: Beer-friendly venues (80-90% likelihood)
    { category: "sports_bar", weight: 0.88, tier: 2, destinationScore: 0.8 },
    { category: "gastropub", weight: 0.85, tier: 2, destinationScore: 0.7 },
    { category: "bar", weight: 0.82, tier: 2, destinationScore: 0.75 },

    // Tier 3: General venues with beer (35% likelihood - most restaurants aren't beer specialists)
    { category: "restaurant", weight: 0.35, tier: 3, destinationScore: 0.55 },
    { category: "tapas_bar", weight: 0.75, tier: 2, destinationScore: 0.75 }, // Above 0.70 threshold
    { category: "lounge", weight: 0.72, tier: 2, destinationScore: 0.75 }, // Above 0.70 threshold

    // Tier 4: Retail venues (60-70% likelihood)
    { category: "cafe", weight: 0.35, tier: 3, destinationScore: 0.6 }, // Many cafes serve beer, especially gastropub-style
    { category: "liquor_store", weight: 0.68, tier: 3, destinationScore: 0.15 },
    {
      category: "beer_wine_and_spirits",
      weight: 0.85,
      tier: 1,
      destinationScore: 0.15,
    }, // Specialist beer retailer
    {
      category: "beverage_store",
      weight: 0.75,
      tier: 2,
      destinationScore: 0.2,
    }, // Above 0.70 threshold

    // Tier 5: Cuisine-specific restaurants (70-80% likelihood)
    {
      category: "mexican_restaurant",
      weight: 0.82,
      tier: 2,
      destinationScore: 0.6,
    }, // Beer/cocktails focus
    {
      category: "thai_restaurant",
      weight: 0.78,
      tier: 2,
      destinationScore: 0.55,
    }, // Above 0.70 threshold
    {
      category: "chinese_restaurant",
      weight: 0.7,
      tier: 2,
      destinationScore: 0.55,
    }, // At 0.70 threshold
    {
      category: "japanese_restaurant",
      weight: 0.75,
      tier: 2,
      destinationScore: 0.6,
    }, // Above 0.70 threshold
    {
      category: "sushi_restaurant",
      weight: 0.72,
      tier: 2,
      destinationScore: 0.65,
    }, // Above 0.70 threshold

    // Tier 6: Entertainment venues (55-70% likelihood)
    { category: "music_venue", weight: 0.7, tier: 2, destinationScore: 0.8 }, // At 0.70 threshold
    { category: "casino", weight: 0.65, tier: 3, destinationScore: 0.45 },
    { category: "hotel", weight: 0.6, tier: 3, destinationScore: 0.4 }, // Consistent with wine
    { category: "resort", weight: 0.65, tier: 3, destinationScore: 0.85 }, // Consistent with wine

    // Tier 7: Grocery retail (40-55% likelihood)
    { category: "grocery_store", weight: 0.5, tier: 3, destinationScore: 0.1 },
    { category: "supermarket", weight: 0.52, tier: 3, destinationScore: 0.1 },
    {
      category: "specialty_grocery_store",
      weight: 0.45,
      tier: 3,
      destinationScore: 0.2,
    },
  ],

  spirit: [
    // Tier 1: Primary spirits venues (90%+ likelihood)
    { category: "distillery", weight: 0.98, tier: 1, destinationScore: 0.95 },
    { category: "cocktail_bar", weight: 0.95, tier: 1, destinationScore: 0.75 },
    { category: "whiskey_bar", weight: 0.97, tier: 1, destinationScore: 0.8 },
    { category: "sake_bar", weight: 0.94, tier: 1, destinationScore: 0.8 }, // For sake spirits

    // Tier 2: Upscale drinking venues (80-90% likelihood)
    { category: "bar", weight: 0.88, tier: 2, destinationScore: 0.75 },
    { category: "lounge", weight: 0.85, tier: 2, destinationScore: 0.75 },
    { category: "wine_bar", weight: 0.82, tier: 2, destinationScore: 0.8 }, // Often has premium spirits

    // Tier 3: General venues with spirits (40% likelihood - most restaurants aren't spirits specialists)
    { category: "restaurant", weight: 0.4, tier: 3, destinationScore: 0.55 },
    { category: "gastropub", weight: 0.75, tier: 2, destinationScore: 0.7 }, // Above 0.70 threshold
    { category: "pub", weight: 0.72, tier: 2, destinationScore: 0.75 }, // Above 0.70 threshold

    // Tier 4: Retail venues (75-85% likelihood) - High for spirits
    { category: "liquor_store", weight: 0.85, tier: 2, destinationScore: 0.15 },
    {
      category: "beer_wine_and_spirits",
      weight: 0.9,
      tier: 1,
      destinationScore: 0.15,
    }, // Specialist spirits retailer
    {
      category: "wine_wholesaler",
      weight: 0.65,
      tier: 3,
      destinationScore: 0.2,
    }, // Some carry premium spirits
    { category: "beverage_store", weight: 0.7, tier: 2, destinationScore: 0.2 }, // At 0.70 threshold

    // Tier 5: Cuisine-specific restaurants (65-80% likelihood)
    {
      category: "japanese_restaurant",
      weight: 0.8,
      tier: 2,
      destinationScore: 0.6,
    }, // Sake/whiskey focus
    {
      category: "sushi_restaurant",
      weight: 0.78,
      tier: 2,
      destinationScore: 0.65,
    }, // Above 0.70 threshold
    { category: "steakhouse", weight: 0.75, tier: 2, destinationScore: 0.7 }, // Above 0.70 threshold
    {
      category: "french_restaurant",
      weight: 0.7,
      tier: 2,
      destinationScore: 0.65,
    }, // At 0.70 threshold
    {
      category: "mexican_restaurant",
      weight: 0.72,
      tier: 2,
      destinationScore: 0.6,
    }, // Above 0.70 threshold
    {
      category: "chinese_restaurant",
      weight: 0.65,
      tier: 3,
      destinationScore: 0.55,
    }, // More consistent with other items

    // Tier 6: Entertainment venues (60-75% likelihood)
    { category: "casino", weight: 0.75, tier: 2, destinationScore: 0.45 }, // Above 0.70 threshold
    { category: "music_venue", weight: 0.68, tier: 3, destinationScore: 0.8 },
    { category: "hotel", weight: 0.65, tier: 3, destinationScore: 0.4 },
    { category: "resort", weight: 0.7, tier: 2, destinationScore: 0.85 }, // At 0.70 threshold

    // Tier 7: Grocery retail (35-50% likelihood)
    {
      category: "specialty_grocery_store",
      weight: 0.5,
      tier: 3,
      destinationScore: 0.2,
    },
    {
      category: "organic_grocery_store",
      weight: 0.4,
      tier: 3,
      destinationScore: 0.15,
    },
    { category: "grocery_store", weight: 0.38, tier: 3, destinationScore: 0.1 },
    { category: "supermarket", weight: 0.42, tier: 3, destinationScore: 0.1 },
  ],

  coffee: [
    // Tier 1: Primary coffee venues (95%+ likelihood)
    { category: "coffee_shop", weight: 0.98, tier: 1, destinationScore: 0.65 },
    { category: "cafe", weight: 0.95, tier: 1, destinationScore: 0.6 },
    {
      category: "coffee_roastery",
      weight: 0.97,
      tier: 1,
      destinationScore: 0.85,
    },

    // Tier 2: Strong coffee focus venues (70-89% likelihood)
    { category: "hotel", weight: 0.85, tier: 2, destinationScore: 0.4 }, // Hotels always serve coffee - premium service
    { category: "resort", weight: 0.85, tier: 2, destinationScore: 0.85 }, // Resorts have extensive coffee service
    {
      category: "specialty_grocery_store",
      weight: 0.85,
      tier: 2,
      destinationScore: 0.2,
    }, // Often carry premium coffee
    {
      category: "organic_grocery_store",
      weight: 0.8,
      tier: 2,
      destinationScore: 0.15,
    }, // Strong coffee focus

    // Tier 3: General venues with coffee (30-69% likelihood)
    { category: "supermarket", weight: 0.68, tier: 3, destinationScore: 0.1 },
    { category: "gastropub", weight: 0.68, tier: 3, destinationScore: 0.7 }, // Tier 3 per 0.70 threshold
    { category: "grocery_store", weight: 0.65, tier: 3, destinationScore: 0.1 },
    {
      category: "italian_restaurant",
      weight: 0.65,
      tier: 3,
      destinationScore: 0.6,
    }, // Strong espresso culture
    {
      category: "french_restaurant",
      weight: 0.6,
      tier: 3,
      destinationScore: 0.65,
    }, // Coffee culture
    { category: "lounge", weight: 0.6, tier: 3, destinationScore: 0.75 },
    { category: "music_venue", weight: 0.45, tier: 3, destinationScore: 0.8 }, // Some serve coffee - consistent
    { category: "bar", weight: 0.45, tier: 3, destinationScore: 0.75 }, // Some cocktail bars serve coffee cocktails
    { category: "casino", weight: 0.45, tier: 3, destinationScore: 0.45 }, // 24/7 coffee service
    { category: "restaurant", weight: 0.3, tier: 3, destinationScore: 0.55 },
  ],

  sake: [
    // Tier 1: Primary sake venues (90%+ likelihood)
    { category: "sake_bar", weight: 0.95, tier: 1, destinationScore: 0.8 },
    {
      category: "japanese_restaurant",
      weight: 0.92,
      tier: 1,
      destinationScore: 0.7,
    }, // Izakayas and Japanese restaurants
    {
      category: "sushi_restaurant",
      weight: 0.9,
      tier: 1,
      destinationScore: 0.75,
    }, // Traditional sake pairing

    // Tier 2: Asian and upscale venues (75-89% likelihood)
    { category: "bar", weight: 0.8, tier: 2, destinationScore: 0.75 }, // Many modern bars serve sake
    { category: "cocktail_bar", weight: 0.78, tier: 2, destinationScore: 0.75 }, // Sake cocktails
    { category: "wine_bar", weight: 0.75, tier: 2, destinationScore: 0.8 }, // Often carry premium sake

    // Tier 3: General restaurants and retail (50-74% likelihood)
    { category: "restaurant", weight: 0.5, tier: 3, destinationScore: 0.55 }, // General restaurants may carry sake
    { category: "liquor_store", weight: 0.7, tier: 2, destinationScore: 0.15 }, // Specialty sake retailers
    {
      category: "beer_wine_and_spirits",
      weight: 0.72,
      tier: 2,
      destinationScore: 0.15,
    }, // Above 0.70 threshold
    {
      category: "specialty_grocery_store",
      weight: 0.65,
      tier: 3,
      destinationScore: 0.2,
    }, // Asian markets and specialty stores

    // Tier 4: Entertainment and hospitality venues (45-65% likelihood)
    { category: "hotel", weight: 0.55, tier: 3, destinationScore: 0.4 }, // Upscale hotels often serve sake
    { category: "resort", weight: 0.6, tier: 3, destinationScore: 0.85 }, // Resort dining
    { category: "casino", weight: 0.5, tier: 3, destinationScore: 0.45 }, // Gaming establishments
  ],
};
