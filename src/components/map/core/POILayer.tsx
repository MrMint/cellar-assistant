"use client";

import { AnimatePresence } from "framer-motion";
import React, { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  MARKER_ANIMATION_TRANSITION,
  MARKER_ANIMATION_VARIANTS,
} from "../constants/animations";
import { ClusterMarker } from "../markers/ClusterMarker";
import { PlaceMarker } from "../markers/PlaceMarker";
import { UserLocationMarker } from "../markers/UserLocationMarker";
import { PlaceDetailsDrawer } from "../places/PlaceDetailsDrawer";
import type {
  MapBounds,
  MapDataItem,
  Place,
  PlaceCluster,
  PlaceResult,
} from "../types";
import { LabelStyling } from "../utils/labelStyling";
import { filterItemsByViewport } from "../utils/viewportFilter";
import type { VisitStatus } from "./MapFilter";

const NOOP = () => {};

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
  viewportBounds?: MapBounds;
}

/**
 * Unified POI Layer component that handles both clustered and non-clustered data
 * Combines the best features from POILayerV2 and POILayerClustered
 */

const POILayerComponent: React.FC<POILayerProps> = ({
  items,
  userLocation,
  onPlaceSelect,
  onClusterClick,
  selectedPlace,
  drawerOpen = false,
  onDrawerClose = NOOP,
  isDarkMode = false,
  userId,
  currentZoom = 12,
  filters,
  viewportBounds,
}) => {
  // Defer item updates so React can yield between renders on slow devices
  const deferredItems = useDeferredValue(items);

  // Filter to only items within viewport + buffer, then split into places/clusters
  const { places, clusters } = useMemo(() => {
    const visible = filterItemsByViewport(deferredItems, viewportBounds);
    return {
      places: visible.filter(
        (item): item is PlaceResult => !("is_cluster" in item),
      ),
      clusters: visible.filter(
        (item): item is PlaceCluster =>
          "is_cluster" in item && item.is_cluster,
      ),
    };
  }, [deferredItems, viewportBounds]);

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

  // Handle marker click
  const handleMarkerClick = useCallback(
    (place: Place) => {
      onPlaceSelect?.(place);
    },
    [onPlaceSelect],
  );

  // Handle cluster click - stable callback, center passed via prop
  const handleClusterClick = useCallback(
    (clusterId: number, clusterCenter: [number, number]) => {
      onClusterClick?.(clusterId, clusterCenter);
    },
    [onClusterClick],
  );

  const isMobile = useMediaQuery("(max-width: 768px)");
  const Wrapper = isMobile ? React.Fragment : AnimatePresence;

  return (
    <>
      {/* Render server-side clusters */}
      <Wrapper>
        {clusters.map((cluster) => {
          const [longitude, latitude] = cluster.cluster_center.coordinates;

          return (
            <ClusterMarker
              key={`cluster-${cluster.cluster_id}`}
              position={[latitude, longitude]}
              pointCount={cluster.cluster_count}
              clusterId={cluster.cluster_id}
              clusterCenter={[longitude, latitude]}
              isDarkMode={isDarkMode}
              onClusterClick={handleClusterClick}
              animationVariants={MARKER_ANIMATION_VARIANTS}
              animationTransition={MARKER_ANIMATION_TRANSITION}
              disableAnimations={isMobile}
            />
          );
        })}
      </Wrapper>

      {/* Render individual places */}
      <Wrapper>
        {places.map((place) => (
          <PlaceMarker
            key={place.id}
            place={place}
            filters={filters}
            onPlaceClick={handleMarkerClick}
            animationVariants={MARKER_ANIMATION_VARIANTS}
            animationTransition={MARKER_ANIMATION_TRANSITION}
            disableAnimations={isMobile}
          />
        ))}
      </Wrapper>

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
            onClose={onDrawerClose}
            userId={userId}
          />,
          document.body,
        )}
    </>
  );
};

export const POILayer = React.memo(POILayerComponent);
