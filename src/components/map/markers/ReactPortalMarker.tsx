"use client";

import type * as L from "leaflet";
import { DivIcon } from "leaflet";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type MarkerProps } from "react-leaflet";

interface ReactPortalMarkerProps extends Omit<MarkerProps, "icon"> {
  children: React.ReactNode;
  stableId?: string; // Optional stable ID to prevent regeneration
  key?: string; // Allow key for AnimatePresence
  zIndexOffset?: number; // Leaflet z-index offset for proper layering
  pane?: string; // Custom map pane for z-index control
}

/**
 * Custom marker component that renders React children inside a Leaflet marker
 * using createPortal with proper lifecycle management
 */
const ReactPortalMarkerComponent: React.FC<ReactPortalMarkerProps> = ({
  children,
  eventHandlers: providedEventHandlers,
  stableId,
  zIndexOffset,
  pane,
  ...markerProps
}) => {
  const [markerRendered, setMarkerRendered] = useState(false);

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

  // Handle marker lifecycle events
  const handleAddEvent = useCallback(
    (e: L.LeafletEvent) => {
      if (!markerRendered) {
        setMarkerRendered(true);
      }
      if (providedEventHandlers?.add) providedEventHandlers.add(e);
    },
    [providedEventHandlers?.add, markerRendered],
  );

  const handleRemoveEvent = useCallback(
    (e: L.LeafletEvent) => {
      if (markerRendered) {
        setMarkerRendered(false);
      }
      if (providedEventHandlers?.remove) providedEventHandlers.remove(e);
    },
    [providedEventHandlers?.remove, markerRendered],
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

  // Get portal target element with retry mechanism for timing issues
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const findTarget = () => {
      const element = document.getElementById(markerId);
      if (element) {
        setPortalTarget(element);
      } else if (markerRendered) {
        // If marker is rendered but no element found, retry after a short delay
        const timer = setTimeout(() => {
          const retryElement = document.getElementById(markerId);
          if (retryElement) {
            setPortalTarget(retryElement);
          }
        }, 10); // Small delay to allow DOM insertion
        return () => clearTimeout(timer);
      }
    };

    findTarget();
  }, [markerId, markerRendered]);

  // Cleanup effect to handle component unmount or ID changes
  useEffect(() => {
    return () => {
      // Clean up DOM element when component unmounts or ID changes
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
      {portalTarget?.isConnected && createPortal(children, portalTarget)}
    </>
  );
};

export const ReactPortalMarker = ReactPortalMarkerComponent;

export default ReactPortalMarker;
