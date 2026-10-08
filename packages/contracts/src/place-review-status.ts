/**
 * `places.review_status` (X27 / D28) — on its own subpath because
 * `@cellar-assistant/policy` needs it and must not pull the whole contracts
 * root (and its `fetch` / `node:crypto` users) into its type graph.
 *
 * `pending` and `rejected` are creator-only; `approved` is shared. Every
 * Overture row, and every user place created before X27 (the synchronous gate
 * had already let it through), is `approved`.
 */
export const PLACE_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type PlaceReviewStatus = (typeof PLACE_REVIEW_STATUSES)[number];

export const isPlaceReviewStatus = (
  value: unknown,
): value is PlaceReviewStatus =>
  typeof value === "string" &&
  (PLACE_REVIEW_STATUSES as readonly string[]).includes(value);
