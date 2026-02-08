"use client";

import type * as L from "leaflet";
import { DivIcon } from "leaflet";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type MarkerProps } from "react-leaflet";

interface ReactPortalMarkerProps extends Omit<MarkerProps, "icon"> {
  children: React.ReactNode;
  stableId?: string;
  key?: string;
  zIndexOffset?: number;
  pane?: string;
}

/**
 * Custom marker component that renders React children inside a Leaflet marker
 * using createPortal with proper lifecycle management.
 * Optimized to minimize re-renders on mount (ref-based portal target).
 */
const ReactPortalMarkerComponent: React.FC<ReactPortalMarkerProps> = ({
  children,
  eventHandlers: providedEventHandlers,
  stableId,
  zIndexOffset,
  pane,
  ...markerProps
}) => {
  // Use ref for portal target to avoid extra state-driven re-renders
  const portalTargetRef = useRef<HTMLElement | null>(null);
  const [_renderTick, setRenderTick] = useState(0);

  // Use stable ID if provided, otherwise generate unique ID
  const markerId = useMemo(
    () =>
      stableId
        ? `react-marker-${stableId}`
        : `react-marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    [stableId],
  );

  // Create DivIcon with unique container ID
  const portalIcon = useMemo(
    () =>
      new DivIcon({
        className: "react-portal-marker",
        html: `<div id="${markerId}" style="width: 100px; height: 100px; position: relative;"></div>`,
        iconSize: [100, 100],
        iconAnchor: [50, 50],
      }),
    [markerId],
  );

  // Handle marker add — find portal target and trigger single re-render
  const handleAddEvent = useCallback(
    (e: L.LeafletEvent) => {
      const element = document.getElementById(markerId);
      if (element) {
        portalTargetRef.current = element;
        setRenderTick((n) => n + 1);
      } else {
        // Retry once on next frame if DOM not ready yet
        requestAnimationFrame(() => {
          const retryElement = document.getElementById(markerId);
          if (retryElement) {
            portalTargetRef.current = retryElement;
            setRenderTick((n) => n + 1);
          }
        });
      }
      providedEventHandlers?.add?.(e);
    },
    [markerId, providedEventHandlers?.add],
  );

  // Handle marker remove — clear portal target
  const handleRemoveEvent = useCallback(
    (e: L.LeafletEvent) => {
      portalTargetRef.current = null;
      providedEventHandlers?.remove?.(e);
    },
    [providedEventHandlers?.remove],
  );

  // Combine provided event handlers with our lifecycle handlers
  const eventHandlers = useMemo(
    () => ({
      ...providedEventHandlers,
      add: handleAddEvent,
      remove: handleRemoveEvent,
    }),
    [providedEventHandlers, handleAddEvent, handleRemoveEvent],
  );

  // Cleanup effect to handle component unmount or ID changes
  useEffect(() => {
    return () => {
      const element = document.getElementById(markerId);
      if (element) {
        element.remove();
      }
    };
  }, [markerId]);

  return (
    <>
      <Marker
        key={markerId}
        {...markerProps}
        icon={portalIcon}
        eventHandlers={eventHandlers}
        zIndexOffset={zIndexOffset}
        pane={pane || "overlayPane"}
      />
      {portalTargetRef.current?.isConnected &&
        createPortal(children, portalTargetRef.current)}
    </>
  );
};

export const ReactPortalMarker = React.memo(ReactPortalMarkerComponent);

export default ReactPortalMarker;
