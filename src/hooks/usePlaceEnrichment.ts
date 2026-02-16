"use client";

import { useEffect, useRef, useState } from "react";
import {
  enrichPlaceAction,
  type GoogleEnrichmentResult,
} from "@/app/(authenticated)/map/place-actions";
import type { PlaceEnrichment, PlaceGooglePhoto } from "@/types/places";

interface UsePlaceEnrichmentResult {
  enrichment: PlaceEnrichment | null;
  photos: PlaceGooglePhoto[];
  isEnriching: boolean;
  error: string | null;
}

// Module-level cache — survives drawer close/reopen and component remounts
const MAX_CACHE_SIZE = 50;
const enrichmentCache = new Map<
  string,
  {
    enrichment: PlaceEnrichment | null;
    photos: PlaceGooglePhoto[];
    fetchedAt: number;
  }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes client-side

/** Evict the oldest entry when cache exceeds MAX_CACHE_SIZE. */
function cacheSet(
  key: string,
  value: typeof enrichmentCache extends Map<string, infer V> ? V : never,
) {
  if (enrichmentCache.size >= MAX_CACHE_SIZE) {
    // Map iterates in insertion order — first key is oldest
    const oldestKey = enrichmentCache.keys().next().value;
    if (oldestKey !== undefined) enrichmentCache.delete(oldestKey);
  }
  enrichmentCache.set(key, value);
}

/**
 * Hook to lazily enrich a place with Google data and photos.
 * Uses a module-level cache to avoid redundant server round-trips
 * across drawer open/close cycles and component remounts.
 * Server-side caching (30-day TTL) prevents actual Google API calls.
 */
export function usePlaceEnrichment(
  placeId: string | undefined,
): UsePlaceEnrichmentResult {
  const [enrichment, setEnrichment] = useState<PlaceEnrichment | null>(null);
  const [photos, setPhotos] = useState<PlaceGooglePhoto[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!placeId) return;

    // Already fetched for this placeId in this hook instance
    if (fetchedForRef.current === placeId) return;

    // Check module-level cache
    const cached = enrichmentCache.get(placeId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setEnrichment(cached.enrichment);
      setPhotos(cached.photos);
      fetchedForRef.current = placeId;
      return;
    }

    // Cache miss or stale — clear old state and fetch from server
    setEnrichment(null);
    setPhotos([]);
    fetchedForRef.current = placeId;
    let cancelled = false;

    async function fetchEnrichment(id: string) {
      setIsEnriching(true);
      setError(null);
      try {
        const result: GoogleEnrichmentResult = await enrichPlaceAction({
          placeId: id,
        });
        if (cancelled) return;

        if (result.success && result.enrichment) {
          setEnrichment(result.enrichment);
          const fetchedPhotos: PlaceGooglePhoto[] = result.photos ?? [];
          setPhotos(fetchedPhotos);

          cacheSet(id, {
            enrichment: result.enrichment,
            photos: fetchedPhotos,
            fetchedAt: Date.now(),
          });
        } else if (result.reason) {
          if (!cancelled) setError(result.reason);
        }
      } catch {
        // Fetch failed — reset ref so a re-render can retry
        if (!cancelled) fetchedForRef.current = null;
      } finally {
        if (!cancelled) setIsEnriching(false);
      }
    }

    fetchEnrichment(placeId);

    return () => {
      cancelled = true;
    };
  }, [placeId]);

  return { enrichment, photos, isEnriching, error };
}
