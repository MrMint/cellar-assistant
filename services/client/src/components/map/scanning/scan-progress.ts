/**
 * N06a — "menu-scan truth": what a scan's two statuses mean to the screens
 * that show it, kept out of the markup so the shadcn migration (D20) swaps the
 * components and keeps this.
 *
 * Two statuses, because the pipeline has two halves. `processingStatus` is
 * extraction and turns `completed` the moment the model has read the photo —
 * before the lines are filed on the place, and before any line is matched.
 * `matchStatus` (`MenuScan.matchStatus`) is the match run. Everything that used
 * to treat `completed` as "done" raced the second half: the scanner fired the
 * place page's refetch while the menu was still empty, and the results page
 * called every line "not yet matched" while the job was still deciding.
 */

import type {
  MenuItemView,
  ScanMatchStatus,
  ScanStatus as ScanProcessingStatus,
  SuggestionView,
} from "../adapter";

export type { ScanMatchStatus, ScanProcessingStatus };

export type ScanProgress = {
  readonly processingStatus: ScanProcessingStatus;
  readonly matchStatus: ScanMatchStatus;
};

/** Nothing will change any more without somebody doing something. */
export const isMatchSettled = (status: ScanMatchStatus): boolean =>
  status === "completed" || status === "failed" || status === "skipped";

/**
 * The whole pipeline is finished: extraction failed (there is nothing to
 * match), or the match run has settled.
 */
export const isScanSettled = (scan: ScanProgress): boolean =>
  scan.processingStatus === "failed" || isMatchSettled(scan.matchStatus);

/** Extraction is finished; the match run may still be going. */
export const isExtractionDone = (scan: ScanProgress): boolean =>
  scan.processingStatus === "completed" || scan.processingStatus === "failed";

export type ScanPhase = "uploading" | "reading" | "matching" | "done";

/**
 * The step the scanner's progress shows. `null` is "no scan yet": the file is
 * still uploading, before `createMenuScan` has answered.
 */
export const scanPhase = (scan: ScanProgress | null): ScanPhase => {
  if (scan === null) return "uploading";
  if (!isExtractionDone(scan)) return "reading";
  return isScanSettled(scan) ? "done" : "matching";
};

/**
 * "Scan Complete!" auto-advances into the results (N06a): as soon as the
 * extraction has read at least one line, the results page is the better
 * screen — it shows the lines and the match run landing on them. A scan that
 * failed, or read nothing, stays on the scanner, whose message and "Scan
 * Another Menu" are the useful next step there.
 */
export const shouldOpenResults = (
  scan: ScanProgress & { readonly itemsDetected: number | null },
): boolean =>
  scan.processingStatus === "completed" && (scan.itemsDetected ?? 0) > 0;

/* -------------------------------------------------------------------------- */
/* Polling                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How often to re-read while the pipeline works: quickly at first, since a
 * typical scan settles in 5–20 s, then backing off so a slow model run does
 * not hammer the API. Capped, not unbounded — see `POLL_GIVE_UP_MS`.
 */
export const pollDelayMs = (attempt: number): number =>
  Math.min(2_000 * 1.5 ** Math.max(0, attempt - 4), 15_000);

/**
 * Stop polling after this long and say so, rather than spin forever: the
 * outbox retries a failed step for ~17 minutes, and nobody watches a spinner
 * for that. A manual refresh restarts the clock.
 */
export const POLL_GIVE_UP_MS = 3 * 60_000;

/* -------------------------------------------------------------------------- */
/* One line's match, and the headline                                          */
/* -------------------------------------------------------------------------- */

/** A decision the viewer has made and the server has not confirmed yet. */
export type PendingDecision = "ACCEPT" | "REJECT";

export type LineMatch =
  | {
      readonly kind: "matched";
      readonly name: string;
      readonly href: string | null;
      /** True until the server has recorded the acceptance. */
      readonly optimistic: boolean;
    }
  | { readonly kind: "suggested"; readonly suggestion: SuggestionView }
  | { readonly kind: "new" };

/**
 * What one menu line is, given everything the page knows about it.
 *
 * Precedence, and why:
 * 1. the line's own verified match on `place_menu_items` — the server's
 *    settled answer;
 * 2. an accepted suggestion, or one the viewer has just accepted. An
 *    acceptance reaches `place_menu_items` through an outbox hop
 *    (`PlaceActor.verifyMenuItemMatch`), and a cocktail's never does — it
 *    lands on `menu_item_recipes`, which this page does not read — so going
 *    by `matched_item` alone re-rendered an accepted line as "not yet
 *    matched". The acceptance *is* the match;
 * 3. the first suggestion still awaiting a decision, skipping any the viewer
 *    has just rejected, so the next candidate shows straight away;
 * 4. otherwise, the line is new to the catalog.
 */
export const lineMatch = (
  item: Pick<MenuItemView, "id" | "matched_item">,
  suggestions: readonly SuggestionView[],
  decisions: ReadonlyMap<string, PendingDecision> = new Map(),
  itemHref: (
    matched: NonNullable<MenuItemView["matched_item"]>,
  ) => string | null = () => null,
): LineMatch => {
  if (item.matched_item) {
    return {
      kind: "matched",
      name: item.matched_item.name,
      href: itemHref(item.matched_item),
      optimistic: false,
    };
  }
  const mine = suggestions.filter((s) => s.place_menu_item_id === item.id);
  const accepted = mine.find(
    (s) =>
      (s.accepted === true && decisions.get(s.id) !== "REJECT") ||
      (s.pending && decisions.get(s.id) === "ACCEPT"),
  );
  if (accepted) {
    return {
      kind: "matched",
      name: accepted.suggested?.name ?? accepted.menu_item_name,
      href: accepted.suggested?.href ?? null,
      optimistic: accepted.accepted !== true,
    };
  }
  const open = mine.find((s) => s.pending && !decisions.has(s.id));
  if (open) return { kind: "suggested", suggestion: open };
  return { kind: "new" };
};

export type ScanHeadline = {
  readonly read: number;
  readonly matched: number;
  readonly fresh: number;
  /** Lines with a suggestion still waiting on Accept / Reject. */
  readonly toConfirm: number;
  /** The one line the summary card leads with. */
  readonly text: string;
};

/**
 * "8 read · 2 matched · 6 new" — the honest headline (N06a).
 *
 * `read` is what extraction read (`itemsDetected`), not how many rows the
 * page has loaded. A line is *matched* once it is matched or carries a
 * suggestion (it is in the catalog, pending your confirmation); *new* is the
 * rest — lines the catalog does not have. Counting before the match run has
 * settled would call every line new, so until then the headline says it is
 * still matching instead of guessing.
 */
export const scanHeadline = (
  scan: ScanProgress & { readonly itemsDetected: number },
  lines: readonly LineMatch[],
): ScanHeadline => {
  const read = Math.max(scan.itemsDetected, lines.length);
  const matched = lines.filter((line) => line.kind !== "new").length;
  const toConfirm = lines.filter((line) => line.kind === "suggested").length;
  const fresh = Math.max(0, read - matched);
  const readText = `${read} read`;
  if (scan.processingStatus === "failed") {
    return { read: 0, matched: 0, fresh: 0, toConfirm: 0, text: "Not read" };
  }
  if (!isExtractionDone(scan)) {
    return { read: 0, matched: 0, fresh: 0, toConfirm: 0, text: "Reading…" };
  }
  if (scan.matchStatus === "skipped") {
    return { read, matched, fresh, toConfirm, text: readText };
  }
  if (!isMatchSettled(scan.matchStatus)) {
    return { read, matched, fresh, toConfirm, text: `${readText} · matching…` };
  }
  return {
    read,
    matched,
    fresh,
    toConfirm,
    text: `${readText} · ${matched} matched · ${fresh} new`,
  };
};
