/**
 * What the place drawer and the place page say about Google details that are
 * on their way (N22, D16) — the decision, separate from the hook that polls,
 * so the rule is testable and survives the shadcn migration unchanged.
 *
 * - `loading`: a skeleton, for at most {@link ENRICHMENT_SKELETON_CAP_MS}
 *   after the enrichment was queued. It used to be a spinner for as long as
 *   the bounded poll ran — three minutes — and indefinitely in practice for a
 *   place Google would never match.
 * - `pending`: a calm "Details pending" line. Shown once the skeleton's time
 *   is up while the queued enrichment is still outstanding, and straight away
 *   when the Google Places allowance is spent (`BUDGET_DENIED`, D16) — the
 *   details will come, just not now, and nothing about that is an error.
 * - `idle`: nothing to say — the details are here, nothing was asked, or the
 *   ask settled without queueing anything.
 */

export const ENRICHMENT_SKELETON_CAP_MS = 8_000;

/** How this tab's last ask about the place's details ended. */
export type EnrichmentAsk =
  | { readonly kind: "none" }
  | { readonly kind: "queued"; readonly at: number }
  | { readonly kind: "budget_denied" };

export type EnrichmentView = "idle" | "loading" | "pending";

export function enrichmentView(input: {
  /** `Place.enrichment` is present. */
  readonly hasEnrichment: boolean;
  readonly ask: EnrichmentAsk;
  readonly now: number;
  readonly capMs?: number;
}): EnrichmentView {
  if (input.hasEnrichment) return "idle";
  switch (input.ask.kind) {
    case "none":
      return "idle";
    case "budget_denied":
      return "pending";
    case "queued": {
      const cap = input.capMs ?? ENRICHMENT_SKELETON_CAP_MS;
      return input.now - input.ask.at < cap ? "loading" : "pending";
    }
  }
}

/**
 * Milliseconds until `enrichmentView` would change on its own (the skeleton
 * turning into "Details pending"), or null when only new data can change it.
 */
export function enrichmentViewChangesIn(input: {
  readonly hasEnrichment: boolean;
  readonly ask: EnrichmentAsk;
  readonly now: number;
  readonly capMs?: number;
}): number | null {
  if (input.hasEnrichment || input.ask.kind !== "queued") return null;
  const remaining =
    input.ask.at + (input.capMs ?? ENRICHMENT_SKELETON_CAP_MS) - input.now;
  return remaining > 0 ? remaining : null;
}

/** `enrichPlace`'s status (`QUEUED`, `FRESH`, `BUDGET_DENIED`, …) → the ask. */
export function askFromStatus(
  status: string | null,
  now: number,
): EnrichmentAsk {
  if (status === "QUEUED") return { kind: "queued", at: now };
  if (status === "BUDGET_DENIED") return { kind: "budget_denied" };
  return { kind: "none" };
}
