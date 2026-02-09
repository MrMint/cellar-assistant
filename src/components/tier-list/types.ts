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
}

export interface TierListData {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  listType: string;
  isOwner: boolean;
  itemCount: number;
  items: TierListItemDisplay[];
}
