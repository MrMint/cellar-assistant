/**
 * Resolved data types for the tier list view.
 * All fragment reading and data resolution happens server-side in page.tsx.
 * Client components receive these plain types — no GraphQL imports needed.
 */

import type { ActorErrorReason } from "@/lib/api/errors";
import type { TierListHistoryView } from "./history";
import type { InsightsStatus } from "./insights/insights-view";

export interface TierListItemDisplay {
  id: string;
  band: number;
  position: number;
  name: string;
  subtitle: string;
  href: string;
  /**
   * X23: the list owner's own score — what a ranked row shows, on your list
   * and on a friend's. For an item, `TierListItem.ownerReview`; for a place,
   * only on your own list (a place rating stays its giver's).
   */
  ownerScore: number | null;
  /**
   * Your own score, shown as a "You 2.5" chip beside the owner's when the
   * list is not yours. On your own list it is the owner's score already.
   */
  viewerScore: number | null;
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
  /** D4: where Undo / Redo stand; null when the viewer is not the owner. */
  history: TierListHistoryView | null;
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
  /** Optional in the current prompt; the card hides without it. */
  blindSpots?: string;
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
  /**
   * N07: where generation stands, from the server (`TierList.insightsStatus`).
   * Optional so an older fixture (or API) without it still renders; the
   * panel then falls back to the old inference (`insights-view.ts`).
   */
  status?: InsightsStatus | null;
  failureReason?: ActorErrorReason | null;
  retryAt?: string | null;
  /**
   * Passport, heatmap and category donut read place fields only. The old page
   * fed insights from places alone, so for an item list they never showed.
   */
  showPlaceStats: boolean;
}
