"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  MARKER_ANIMATION_TRANSITION,
  MARKER_ANIMATION_VARIANTS,
} from "../constants/animations";
import { ClusterMarker } from "../markers/ClusterMarker";
import { PlaceMarker } from "../markers/PlaceMarker";
import { UserLocationMarker } from "../markers/UserLocationMarker";
import { PlaceDetailsDrawer } from "../places/PlaceDetailsDrawer";
// Import types from actions for consistency
import type { MapDataItem, Place, PlaceCluster, PlaceResult } from "../types";
import { LabelStyling } from "../utils/labelStyling";
import type { VisitStatus } from "./MapFilter";

interface POILayerProps {
  items: MapDataItem[];
  userLocation?: { latitude: number; longitude: number } | null;
  onPlaceSelect?: (place: Place) => void;
  onClusterClick?: (clusterId: number, clusterCenter: [number, number]) => void;
  selectedPlace?: Place | null;
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
  isDarkMode?: boolean;
  userId: string;
  currentZoom?: number;
  filters?: {
    selectedItemTypes: string[];
    minRating?: number;
    searchQuery: string;
    visitStatuses: VisitStatus[];
  };
}

/**
 * Unified POI Layer component that handles both clustered and non-clustered data
 * Combines the best features from POILayerV2 and POILayerClustered
 */

export function POILayer({
  items,
  userLocation,
  onPlaceSelect,
  onClusterClick,
  selectedPlace,
  drawerOpen = false,
  onDrawerClose,
  isDarkMode = false,
  userId,
  currentZoom = 12,
  filters,
}: POILayerProps) {
  // Extract places from items first (needed for useEffect dependency)
  const places = useMemo(() => {
    return items.filter((item): item is PlaceResult => !("is_cluster" in item));
  }, [items]);

  // Inject label styling on mount
  useEffect(() => {
    LabelStyling.injectLabelStyles();

    return () => {
      LabelStyling.removeStyles();
    };
  }, []);

  // Update zoom level for responsive labels
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mapContainer = document.querySelector(
        ".leaflet-container",
      ) as HTMLElement;
      if (mapContainer) {
        LabelStyling.updateZoomLevel(mapContainer, currentZoom);
      }
    }
  }, [currentZoom]);

  // Get clusters directly from items
  const clusters = items.filter(
    (item): item is PlaceCluster => "is_cluster" in item && item.is_cluster,
  );

  // Handle marker click
  const handleMarkerClick = useCallback(
    (place: Place) => {
      onPlaceSelect?.(place);
    },
    [onPlaceSelect],
  );

  // Handle cluster click - navigate to cluster center and zoom in
  const handleClusterClick = useCallback(
    (clusterId: number, clusterCenter: [number, number]) => {
      onClusterClick?.(clusterId, clusterCenter);
    },
    [onClusterClick],
  );

  // Remove useMemo to prevent double-renders - inline rendering is actually better here

  return (
    <>
      {/* Render server-side clusters with AnimatePresence */}
      <AnimatePresence>
        {clusters.map((cluster) => {
          const [longitude, latitude] = cluster.cluster_center.coordinates;

          return (
            <ClusterMarker
              key={`cluster-${cluster.cluster_id}`}
              position={[latitude, longitude]} // Leaflet expects [lat, lng]
              pointCount={cluster.cluster_count}
              clusterId={cluster.cluster_id}
              isDarkMode={isDarkMode}
              isDensityHigh={false} // Server-side clustering handles density
              onClusterClick={(id) =>
                handleClusterClick(id, [longitude, latitude])
              }
              // Pass animation variants and transition
              animationVariants={MARKER_ANIMATION_VARIANTS}
              animationTransition={MARKER_ANIMATION_TRANSITION}
            />
          );
        })}
      </AnimatePresence>

      {/* Render filtered individual places with AnimatePresence for smooth transitions */}
      <AnimatePresence>
        {places.map((place) => {
          const [_longitude, _latitude] = place.location.coordinates;

          return (
            <PlaceMarker
              key={place.id}
              place={place}
              filters={filters}
              onPlaceClick={handleMarkerClick}
              // Pass animation variants and transition to PlaceMarker
              animationVariants={MARKER_ANIMATION_VARIANTS}
              animationTransition={MARKER_ANIMATION_TRANSITION}
            />
          );
        })}
      </AnimatePresence>

      {/* Show user location */}
      {userLocation && (
        <UserLocationMarker
          userLocation={userLocation}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Place details drawer - render outside map using portal */}
      {typeof window !== "undefined" &&
        createPortal(
          <PlaceDetailsDrawer
            place={selectedPlace ?? null}
            open={drawerOpen}
            onClose={onDrawerClose || (() => {})}
            userId={userId}
          />,
          document.body,
        )}
    </>
  );
}
