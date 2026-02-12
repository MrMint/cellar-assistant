"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { PlaceDetailsDrawerRef } from "../places/PlaceDetailsDrawer";
import type { PlaceResult } from "../types";
import { useMapActions, useMapUI } from "./useMapMachine";
import { useMapSearchParams } from "./useMapSearchParams";

interface UseMapPlaceSelectionOptions {
  isDesktop: boolean;
  detailDrawerRef: RefObject<PlaceDetailsDrawerRef | null>;
}

/**
 * Encapsulates place selection ↔ URL coordination.
 *
 * Manages the bidirectional relationship between:
 * - XState selectedPlace / drawer state
 * - nuqs placeId URL parameter
 *
 * Handles:
 * - Selecting a place (XState + URL push/replace)
 * - Closing the drawer (XState + URL clear)
 * - Browser back/forward clearing placeId → close drawer
 */
export function useMapPlaceSelection({
  isDesktop,
  detailDrawerRef,
}: UseMapPlaceSelectionOptions) {
  const mapActions = useMapActions();
  const searchParams = useMapSearchParams();
  const { isDrawerOpen } = useMapUI();
  const isManualSelectionRef = useRef(false);

  // Refs to read latest values in callbacks without re-creating them.
  // The nuqs setter wrapper from useMapSearchParams is unstable (new
  // closure each render), and isDrawerOpen changes on selection.
  const setPlaceIdRef = useRef(searchParams.setPlaceId);
  setPlaceIdRef.current = searchParams.setPlaceId;
  const isDrawerOpenRef = useRef(isDrawerOpen);
  isDrawerOpenRef.current = isDrawerOpen;

  const handleSelectPlace = useCallback(
    (place: PlaceResult) => {
      if (!isDesktop) {
        detailDrawerRef.current?.setMiddle();
      }
      mapActions.selectPlace(place);
      isManualSelectionRef.current = true;
      setPlaceIdRef.current(place.id, {
        history: isDrawerOpenRef.current ? "replace" : "push",
      });
    },
    [isDesktop, mapActions, detailDrawerRef],
  );

  const handleCloseDrawer = useCallback(() => {
    mapActions.closeDrawer();
    // Always use nuqs to clear placeId (shallow replaceState).
    // Avoids window.history.back() which triggers a Next.js soft navigation
    // and can cause the entire map component tree to remount.
    setPlaceIdRef.current(null);
  }, [mapActions]);

  // Sync: browser back removes placeId → close drawer
  useEffect(() => {
    if (!searchParams.placeId && isDrawerOpen) {
      mapActions.closeDrawer();
    }
  }, [searchParams.placeId, isDrawerOpen, mapActions]);

  return {
    handleSelectPlace,
    handleCloseDrawer,
    /** Shared with useMapDeepLink to skip programmatic selections */
    isManualSelectionRef,
  };
}
