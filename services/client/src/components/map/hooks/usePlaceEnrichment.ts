"use client";

import { useEffect, useRef, useState } from "react";
import { usePlaceActions } from "../actions";

/**
 * `82450ad1:src/hooks/usePlaceEnrichment.ts`, over the new API.
 *
 * Old behaviour kept: opening a place that has no Google details asks for
 * them, once, without a button — the drawer and the place page both did
 * this — and a spinner shows while they are on their way. A module-level
 * memo (the old 5-minute client cache) stops a drawer reopen from asking
 * again.
 *
 * What changed: the details are no longer the action's return value. They
 * are `Place.enrichment` / `Place.photos` on the page's own query, and the
 * action answers `QUEUED` (an outbox turn), `FRESH`, or `BUDGET_DENIED`. So
 * this hook asks, then re-reads the place every 15 s until the enrichment
 * appears — **bounded**: twelve ticks (three minutes), because an enrichment
 * that never lands (no Google key, no budget, no match) moves nothing and an
 * unbounded poll would run for the life of the tab. It never runs during
 * render or on the server (the old page enriched during SSR, §7).
 *
 * Also kept: the old place page asked again when the details were there but
 * the photos never came (`enrichment && !photos_fetched_at`) — a migrated
 * place enriched before photos were fetched, or a photo loop that died. Here
 * that is `photosPending`: the hook asks once (same memo), and `PlaceActor`
 * queues a photo-only resume (`QUEUED`) or answers `FRESH` when there is
 * nothing to fetch. A queued resume is polled the same bounded way until
 * `photosFetchedAt` is stamped. The spinner stays the details spinner — the
 * old page fetched the photos without one.
 */

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_TICKS = 12;
const REQUEST_TTL_MS = 5 * 60 * 1000;
const MAX_REMEMBERED = 50;

/** placeId → when this tab last asked Google about it. */
const requestedAt = new Map<string, number>();

function rememberRequest(placeId: string) {
  if (requestedAt.size >= MAX_REMEMBERED) {
    const oldest = requestedAt.keys().next().value;
    if (oldest !== undefined) requestedAt.delete(oldest);
  }
  requestedAt.set(placeId, Date.now());
}

interface UsePlaceEnrichmentOptions {
  /** The place to enrich; undefined pauses the hook (drawer closed). */
  placeId: string | undefined;
  /** False until the place query has answered, so absence means absence. */
  loaded: boolean;
  /** Whether `Place.enrichment` is already present. */
  hasEnrichment: boolean;
  /** Details present but `enrichment.photosFetchedAt` is null. */
  photosPending?: boolean;
  /** Re-read the place, network-only. */
  refetch: () => void;
}

export function usePlaceEnrichment({
  placeId,
  loaded,
  hasEnrichment,
  photosPending = false,
  refetch,
}: UsePlaceEnrichmentOptions): { isEnriching: boolean } {
  const { enrichPlaceAction } = usePlaceActions();
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Something is still owed: the details, or the photos that go with them.
  const pending = !hasEnrichment || photosPending;

  // Ask once per place (per TTL) when the place has no enrichment, or has
  // details whose photos were never fetched.
  useEffect(() => {
    if (!placeId || !loaded || !pending) return;
    const last = requestedAt.get(placeId);
    if (last !== undefined && Date.now() - last < REQUEST_TTL_MS) return;
    rememberRequest(placeId);
    let cancelled = false;
    enrichPlaceAction({ placeId }).then((result) => {
      if (cancelled) return;
      if (result.status === "QUEUED") {
        setWaitingFor(placeId);
      } else if (result.status !== null && result.status !== "BUDGET_DENIED") {
        refetchRef.current();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [placeId, loaded, pending, enrichPlaceAction]);

  const waiting = waitingFor !== null && waitingFor === placeId && pending;
  const isEnriching = waiting && !hasEnrichment;

  // Bounded poll while a queued enrichment (or photo resume) is outstanding.
  useEffect(() => {
    if (!waiting) return;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks > MAX_POLL_TICKS) {
        clearInterval(timer);
        setWaitingFor(null);
        return;
      }
      refetchRef.current();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  return { isEnriching };
}
