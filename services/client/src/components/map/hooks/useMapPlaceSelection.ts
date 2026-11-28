"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";
import { afterHistorySettles } from "@/components/app/overlays/layers";
import type { PlaceDetailsDrawerRef } from "../places/PlaceDetailsDrawer";
import type { PlaceResult } from "../types";
import { useMapActions, useMapUI } from "./useMapMachine";
import { useMapSearchParams } from "./useMapSearchParams";

/**
 * Whether the URL just took the open place away (Back): `?placeId=` went
 * from a value to none. A null placeId alone is not that: a pick sets the
 * selection at once and its `?placeId=` a render later, so closing on "null
 * while open" closed every desktop pick as it opened (F-190).
 */
export const urlClosedPlace = (
  previous: string | null,
  next: string | null,
): boolean => previous !== null && next === null;

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
      isManualSelectionRef.current = true;
      if (isDesktop) {
        // FS-2: the desktop pane is an overlay layer, which pushes its own
        // Back entry the moment it opens. nuqs queues its write for a tick
        // and drops the queue on a push that is not its own, so opening the
        // pane first lost `?placeId=` and read as Back: the pane closed as
        // it opened. Write the URL first (replace: the pane's entry is the
        // one Back pops), then open the pane on it.
        void setPlaceIdRef
          .current(place.id, { history: "replace" })
          .then(() => mapActions.selectPlace(place));
        return;
      }
      detailDrawerRef.current?.setMiddle();
      mapActions.selectPlace(place);
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
    if (isDesktop) {
      // The pane's layer takes its entry back off as it closes; clear the
      // URL on the page's own entry once that pop has landed, or the pop
      // would bring `?placeId=` back (F-136's rule).
      afterHistorySettles(() => setPlaceIdRef.current(null));
      return;
    }
    setPlaceIdRef.current(null);
  }, [mapActions, isDesktop]);

  // Sync: browser back removes placeId → close drawer
  const previousPlaceIdRef = useRef(searchParams.placeId);
  useEffect(() => {
    const previous = previousPlaceIdRef.current;
    previousPlaceIdRef.current = searchParams.placeId;
    if (urlClosedPlace(previous, searchParams.placeId) && isDrawerOpen) {
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
