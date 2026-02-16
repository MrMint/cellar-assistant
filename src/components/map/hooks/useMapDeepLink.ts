"use client";

import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { fetchPlaceByIdAction } from "@/app/(authenticated)/map/place-actions";
import type { PlaceDetailsDrawerRef } from "../places/PlaceDetailsDrawer";
import type { PlaceResult } from "../types";
import { getDrawerOffset } from "../utils/layout";
import { useMapActions } from "./useMapMachine";
import { useMapSearchParams } from "./useMapSearchParams";

interface UseMapDeepLinkOptions {
  mapRef: RefObject<MapRef | null>;
  detailDrawerRef: RefObject<PlaceDetailsDrawerRef | null>;
  mapReady: boolean;
  isDesktop: boolean;
  hasSidebar: boolean;
  /** Shared ref from useMapPlaceSelection — true when a place was just
   *  selected programmatically (click/search result), so the deep-link
   *  effect should skip fetching. */
  isManualSelectionRef: MutableRefObject<boolean>;
}

/**
 * Handles deep-link place loading.
 *
 * When placeId appears in the URL from a true deep link (direct navigation,
 * back/forward, shared URL), fetches the place data and flies to it.
 * Skips when placeId was set programmatically by handleSelectPlace.
 */
export function useMapDeepLink({
  mapRef,
  detailDrawerRef,
  mapReady,
  isDesktop,
  hasSidebar,
  isManualSelectionRef,
}: UseMapDeepLinkOptions) {
  const mapActions = useMapActions();
  const { placeId } = useMapSearchParams();
  const deepLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!placeId || !mapReady || deepLinkHandledRef.current === placeId) return;
    deepLinkHandledRef.current = placeId;

    // Skip if this placeId was set programmatically (click/search result)
    if (isManualSelectionRef.current) {
      isManualSelectionRef.current = false;
      return;
    }

    // True deep link — fetch and fly
    let cancelled = false;
    fetchPlaceByIdAction(placeId).then((place) => {
      if (cancelled || !place) return;
      if (!isDesktop) {
        detailDrawerRef.current?.setMiddle();
      }
      mapActions.selectPlace(place as PlaceResult);
      const [lng, lat] = place.location.coordinates;
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 800,
        offset: getDrawerOffset(isDesktop, hasSidebar),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    placeId,
    mapReady,
    mapActions,
    isDesktop,
    hasSidebar,
    isManualSelectionRef,
    mapRef,
    detailDrawerRef,
  ]);
}
