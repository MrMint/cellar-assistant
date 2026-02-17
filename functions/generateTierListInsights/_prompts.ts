import { BAND_LABELS } from "@cellar-assistant/shared/constants/bands";
import type { JSONSchema7 } from "json-schema";

export interface TierListPlaceItem {
  name: string;
  band: number;
  position: number;
  countryCode: string | null;
  region: string | null;
  locality: string | null;
  primaryCategory: string | null;
  categories: string[] | null;
  publicRating: number | null;
  publicRatingCount: number | null;
  priceLevel: number | null;
  editorialSummary: string | null;
}

export const TIER_LIST_INSIGHTS_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    palateProfile: {
      type: "string",
      description: "2-4 sentences, second person, plain text only.",
    },
    blindSpots: {
      type: "string",
      description: "2-3 sentences, encouraging tone, plain text only.",
    },
    hotTake: {
      type: "string",
      description:
        "One punchy sentence, plain text only. Must reference specific items from the list by name.",
    },
    archetype: {
      type: "string",
      description:
        "2-4 word label, title case. e.g. 'The Adventurous Purist', 'The Comfort Maximalist'.",
    },
    archetypeDescription: {
      type: "string",
      description: "One sentence explaining the archetype, plain text only.",
    },
    recommendation: {
      type: "string",
      description:
        "1-2 sentences suggesting a type/style/cuisine to try (not a specific venue). Plain text only.",
    },
  },
  required: [
    "palateProfile",
    "blindSpots",
    "hotTake",
    "archetype",
    "archetypeDescription",
    "recommendation",
  ],
};

interface TierListMeta {
  name: string;
  description: string | null;
}

export function buildInsightsPrompt(
  items: TierListPlaceItem[],
  meta: TierListMeta,
): string {
  const priceLevelLabels: Record<number, string> = {
    0: "Free",
    1: "$",
    2: "$$",
    3: "$$$",
    4: "$$$$",
  };

  const itemsSummary = items
    .map((item, index) => {
      const bandLabel = BAND_LABELS[item.band] ?? "Unrated";
      const location = [item.locality, item.region, item.countryCode]
        .filter(Boolean)
        .join(", ");
      const cats =
        item.categories?.join(", ") ?? item.primaryCategory ?? "unknown";

      const publicParts: string[] = [];
      if (item.publicRating != null) {
        const reviewCount = item.publicRatingCount
          ? ` from ${item.publicRatingCount.toLocaleString()} reviews`
          : "";
        publicParts.push(`Public rating: ${item.publicRating}/5${reviewCount}`);
      }
      if (item.priceLevel != null) {
        publicParts.push(
          priceLevelLabels[item.priceLevel] ?? `$${item.priceLevel}`,
        );
      }
      const publicSuffix =
        publicParts.length > 0 ? ` {${publicParts.join(", ")}}` : "";

      return `${index + 1}. ${item.name} [${bandLabel}, #${item.position + 1} in tier] (${cats}${location ? ` | ${location}` : ""})${publicSuffix}`;
    })
    .join("\n");

  const uniqueCountries = Array.from(
    new Set(items.map((i) => i.countryCode).filter(Boolean)),
  );
  const uniqueCategories = Array.from(
    new Set(
      items.flatMap((i) => i.categories ?? [i.primaryCategory]).filter(Boolean),
    ),
  );
  const uniqueCities = Array.from(
    new Set(items.map((i) => i.locality).filter(Boolean)),
  );

  // Identify top-heavy vs bottom-heavy vs balanced distribution
  const high = items.filter((i) => i.band >= 4).length;
  const mid = items.filter((i) => i.band === 3).length;
  const low = items.filter((i) => i.band <= 2 && i.band > 0).length;
  const total = items.length;
  const distributionShape =
    high > total * 0.5
      ? "generous (mostly high ratings)"
      : low > high
        ? "critical (more low ratings than high)"
        : mid > total * 0.4
          ? "cautious (heavy in the middle)"
          : "balanced (spread across tiers)";

  // Public rating statistics
  const itemsWithPublicRating = items.filter((i) => i.publicRating != null);
  const avgPublicRating =
    itemsWithPublicRating.length > 0
      ? (
          itemsWithPublicRating.reduce(
            (sum, i) => sum + (i.publicRating ?? 0),
            0,
          ) / itemsWithPublicRating.length
        ).toFixed(1)
      : null;
  const itemsWithPrice = items.filter((i) => i.priceLevel != null);

  // Editorial summaries for context
  const editorialSummaries = items
    .filter((i) => i.editorialSummary)
    .map((i) => `- ${i.name}: ${i.editorialSummary}`)
    .join("\n");

  return `You are a witty food and drink culture writer with the observational humor of Anthony Bourdain and the analytical eye of a sommelier. You write personalized insights that feel like a perceptive friend roasting someone affectionately — warm but sharp, always grounded in specifics.

You are analyzing a user's ranked tier list of places (restaurants, bars, cafes, etc.).

## About This List
- Name: "${meta.name}"${meta.description ? `\n- Description: "${meta.description}"` : ""}
The list name and description reveal the user's intent — use them to contextualize your insights.

## Tier List Rankings (overall rank, highest to lowest)
${itemsSummary}

## Summary Statistics
- Total places: ${total}
- Countries (${uniqueCountries.length}): ${uniqueCountries.join(", ") || "none identified"}
- Cities (${uniqueCities.length}): ${uniqueCities.join(", ") || "none identified"}
- Categories: ${uniqueCategories.join(", ") || "none identified"}
- Distribution shape: ${distributionShape}
- Outstanding (5): ${items.filter((i) => i.band === 5).length}
- Very Good (4): ${items.filter((i) => i.band === 4).length}
- Good (3): ${mid}
- Mediocre (2): ${items.filter((i) => i.band === 2).length}
- Bad (1): ${items.filter((i) => i.band === 1).length}
- Unrated (0): ${items.filter((i) => i.band === 0).length}
${
  itemsWithPublicRating.length > 0
    ? `
## Public Ratings Data
- Places with public ratings: ${itemsWithPublicRating.length}/${total}
- Average public rating across listed places: ${avgPublicRating}/5${itemsWithPrice.length > 0 ? `\n- Places with price data: ${itemsWithPrice.length}` : ""}

Use the public ratings to compare the user's personal rankings against crowd consensus. Do they favor hidden gems (low public rating, high tier) or crowd favorites (high public rating, high tier)? Do they disagree with the crowd on any specific places? This contrast is one of the most revealing signals about a rater's personality.`
    : ""
}${
  editorialSummaries
    ? `

## What These Places Are Known For
${editorialSummaries}

Use the editorial summaries to understand what each place actually is — this lets you make more specific, grounded observations instead of relying only on category labels.`
    : ""
}

## What to generate

First, internally analyze the data. Look for:
- The 2-3 most striking patterns (cuisine preferences, geographic clusters, rating tendencies)
- Any surprising contradictions or outliers (e.g. a dive bar rated above a fine dining spot)
- Where the user's rankings diverge from or align with public ratings — this reveals whether they follow the crowd or trust their own palate
- What the distribution shape and city/country clustering reveal about the rater

Then generate these six fields:

1. **palateProfile**: A personality-style description of this person's taste. Reference their actual rankings, the types of places they gravitate toward, and any geographic patterns. Second person. 2-4 sentences.

2. **blindSpots**: What regions, cuisines, or styles of places are missing? Be encouraging and suggest specific types of places (not venue names) to explore. 2-3 sentences.

3. **hotTake**: A single punchy, opinionated sentence reacting to the most interesting or surprising thing about their rankings. Must reference at least one specific place by name from the list. Should feel like a tweet — witty and slightly provocative.

4. **archetype**: A 2-4 word personality label in title case. Think "The Comfort Maximalist", "The Neighborhood Loyalist", "The Passport Collector". Should capture their overall vibe.

5. **archetypeDescription**: One sentence explaining what makes this archetype tick, specific to their data.

6. **recommendation**: Based on the patterns in their top-rated places, suggest a specific type of cuisine, dining style, or experience they'd probably love but haven't tried (based on what's missing from the list). 1-2 sentences. Don't recommend a specific venue — recommend a category or style.

## Tone and style rules
- Plain text only. No markdown, no bullets, no formatting.
- Second person ("you", "your").
- Be specific — name places, cities, and categories from the data.
- Witty and warm, not snarky or mean. Think "affectionate roast", not "takedown."

## Avoid
- Generic compliments ("You have great taste!", "You clearly love food!")
- Vague observations that could apply to anyone ("You seem to enjoy a variety of places")
- Simply restating the data ("You have 5 places rated Outstanding")
- Starting sentences with "It appears that", "It seems like", or "It's clear that"
- Starting palateProfile with "You are a" — vary your sentence openings
- The word "eclectic" (overused in this context)
- Repeating the same observation across multiple fields — each field should surface a different insight. If the hotTake highlights a specific ranking contrast, the palateProfile should focus on a different pattern
- Recommending specific venue names — you don't know what exists

Use the band labels: 5=Outstanding, 4=Very Good, 3=Good, 2=Mediocre, 1=Bad, 0=Unrated.`;
}
