/**
 * Resolved data types for the tier list view.
 * All fragment reading and data resolution happens server-side in page.tsx.
 * Client components receive these plain types — no GraphQL imports needed.
 */

export interface TierListItemDisplay {
  id: string;
  band: number;
  position: number;
  name: string;
  subtitle: string;
  href: string;
  reviewScore: number | null;
  publicRating: number | null;
  publicRatingCount: number | null;
}

export interface TierListData {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  listType: string;
  isOwner: boolean;
  isEditingLocked: boolean;
  itemCount: number;
  items: TierListItemDisplay[];
}

/** Enriched item data for insights computation (resolved server-side) */
export interface TierListInsightsItem {
  id: string;
  band: number;
  name: string;
  countryCode: string | null;
  region: string | null;
  primaryCategory: string | null;
}

/** AI-generated narrative stored in DB */
export interface TierListAIInsights {
  palateProfile: string;
  blindSpots: string;
  hotTake?: string;
  archetype?: string;
  archetypeDescription?: string;
  recommendation?: string;
  generatedAt: string;
}

/** Full data for the Insights tab */
export interface TierListInsightsData {
  items: TierListInsightsItem[];
  aiInsights: TierListAIInsights | null;
  contentUpdatedAt: string | null;
}
