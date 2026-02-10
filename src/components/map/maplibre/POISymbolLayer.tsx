"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "react-map-gl/maplibre";
import { Layer, Source } from "react-map-gl/maplibre";
import type { MapDataItem, MapFilters } from "../types";
import { LAYER_IDS, SOURCE_IDS } from "./constants";
import {
  type MapFeatureProperties,
  transformToGeoJSON,
} from "./utils/geoJsonTransform";

interface POISymbolLayerProps {
  items: MapDataItem[];
  filters?: MapFilters;
  isDarkMode?: boolean;
  currentZoom?: number;
}

const ENTER_EXIT_ANIMATION_MS = 300;
const CLUSTER_SOURCE_ID = `${SOURCE_IDS.POIS}-clusters`;
const transition = { duration: ENTER_EXIT_ANIMATION_MS, delay: 0 } as const;
const CLUSTER_MATCH_DISTANCE_PX = 34;
const CLUSTER_EXACT_MATCH_DISTANCE_PX = 10;

function pixelDistanceToDegrees(zoom: number, pixels: number): number {
  const tileSize = 512;
  const degreesPerPixel = 360 / (tileSize * 2 ** zoom);
  return pixels * degreesPerPixel;
}

type BaseFeature = GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties>;
type TransitionedProperties = MapFeatureProperties & {
  transitionOpacity: number;
  animationKey: string;
  animatedRadius?: number;
  animatedPointCount?: number;
};
type TransitionedFeature = GeoJSON.Feature<GeoJSON.Point, TransitionedProperties>;
type TransitionedCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  TransitionedProperties
>;
type TransitionOptions = {
  clusterSpatialMatching?: boolean;
  currentZoom?: number;
};

function isClusterFeature(
  feature: BaseFeature | TransitionedFeature,
): feature is GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties & { isCluster: true }> {
  return feature.properties.isCluster === true;
}

function featureKey(feature: BaseFeature | TransitionedFeature): string {
  if ("animationKey" in feature.properties) {
    return feature.properties.animationKey;
  }
  const candidate = feature.id ?? feature.properties.id;
  return String(candidate);
}

function getClusterRadius(feature: BaseFeature | TransitionedFeature): number | null {
  if (!isClusterFeature(feature)) return null;
  const props = feature.properties as MapFeatureProperties &
    Partial<TransitionedProperties>;
  const animated = props.animatedRadius;
  if (typeof animated === "number") return animated;
  return feature.properties.radius;
}

function getClusterPointCount(
  feature: BaseFeature | TransitionedFeature,
): number | null {
  if (!isClusterFeature(feature)) return null;
  const props = feature.properties as MapFeatureProperties &
    Partial<TransitionedProperties>;
  const animated = props.animatedPointCount;
  if (typeof animated === "number") return animated;
  return feature.properties.pointCount;
}

function withTransitionOpacity(
  feature: BaseFeature | TransitionedFeature,
  transitionOpacity: number,
  animationKey?: string,
  animatedRadius?: number | null,
  animatedPointCount?: number | null,
  coordinates?: [number, number],
): TransitionedFeature {
  const resolvedAnimationKey = animationKey ?? featureKey(feature);
  const properties: TransitionedProperties = {
    ...feature.properties,
    transitionOpacity,
    animationKey: resolvedAnimationKey,
  };

  if (typeof animatedRadius === "number") {
    properties.animatedRadius = animatedRadius;
  }
  if (typeof animatedPointCount === "number") {
    properties.animatedPointCount = animatedPointCount;
  }

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: coordinates ?? feature.geometry.coordinates,
    },
    properties: {
      ...properties,
    },
  };
}

function useTransitionedCollection(
  nextFeatures: BaseFeature[],
  options?: TransitionOptions,
) {
  const [renderedFeatures, setRenderedFeatures] = useState<TransitionedFeature[]>(
    () => nextFeatures.map((feature) => withTransitionOpacity(feature, 1)),
  );
  const renderedFeaturesRef = useRef(renderedFeatures);
  const animationRafRef = useRef<number | null>(null);
  const cycleRef = useRef(0);

  const setRenderedAndRef = (
    next:
      | TransitionedFeature[]
      | ((current: TransitionedFeature[]) => TransitionedFeature[]),
  ) => {
    const nextValue =
      typeof next === "function" ? next(renderedFeaturesRef.current) : next;
    renderedFeaturesRef.current = nextValue;
    setRenderedFeatures(nextValue);
  };

  useEffect(() => {
    cycleRef.current += 1;
    const cycleId = cycleRef.current;

    if (animationRafRef.current !== null) {
      window.cancelAnimationFrame(animationRafRef.current);
      animationRafRef.current = null;
    }

    const previousFeatures = renderedFeaturesRef.current;
    const clusterSpatialMatching = options?.clusterSpatialMatching === true;
    const matchZoom = options?.currentZoom ?? 12;
    const previousById = new Map<string, TransitionedFeature>();
    for (const feature of previousFeatures) {
      previousById.set(featureKey(feature), feature);
    }

    type AnimatedFeature = {
      animationKey: string;
      feature: BaseFeature | TransitionedFeature;
      startOpacity: number;
      targetOpacity: number;
      startCoordinates: [number, number];
      targetCoordinates: [number, number];
      startRadius: number | null;
      targetRadius: number | null;
      startPointCount: number | null;
      targetPointCount: number | null;
      removeAtEnd: boolean;
    };

    const animated: AnimatedFeature[] = [];
    const seenIds = new Set<string>();
    const usedPreviousIds = new Set<string>();

    const maybeMatchClusterKey = (feature: BaseFeature): string | null => {
      if (!clusterSpatialMatching) return null;
      if (!isClusterFeature(feature)) return null;
      if (!("pointCount" in feature.properties)) return null;

      const [nextLng, nextLat] = feature.geometry.coordinates;
      const nextCount = feature.properties.pointCount;
      const maxDistanceDegrees = pixelDistanceToDegrees(
        matchZoom,
        CLUSTER_MATCH_DISTANCE_PX,
      );
      const exactDistanceDegrees = pixelDistanceToDegrees(
        matchZoom,
        CLUSTER_EXACT_MATCH_DISTANCE_PX,
      );
      const maxDistSq = maxDistanceDegrees ** 2;
      const exactDistSq = exactDistanceDegrees ** 2;
      const lngScale = Math.max(0.25, Math.cos((nextLat * Math.PI) / 180));

      // First pass: near-identical location wins immediately, regardless of
      // point-count churn from server-side reclustering.
      let exactBestKey: string | null = null;
      let exactBestDist = Number.POSITIVE_INFINITY;

      for (const previousFeature of previousFeatures) {
        if (previousFeature.properties.isCluster !== true) continue;
        if (!("pointCount" in previousFeature.properties)) continue;

        const previousId = featureKey(previousFeature);
        if (usedPreviousIds.has(previousId)) continue;

        const [previousLng, previousLat] = previousFeature.geometry.coordinates;
        const deltaLng = (nextLng - previousLng) * lngScale;
        const deltaLat = nextLat - previousLat;
        const distanceSq = deltaLng * deltaLng + deltaLat * deltaLat;
        if (distanceSq > exactDistSq) continue;

        if (distanceSq < exactBestDist) {
          exactBestDist = distanceSq;
          exactBestKey = previousId;
        }
      }

      if (exactBestKey) {
        usedPreviousIds.add(exactBestKey);
        return exactBestKey;
      }

      let bestKey: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const previousFeature of previousFeatures) {
        if (previousFeature.properties.isCluster !== true) continue;
        if (!("pointCount" in previousFeature.properties)) continue;

        const previousId = featureKey(previousFeature);
        if (usedPreviousIds.has(previousId)) continue;

        const [previousLng, previousLat] = previousFeature.geometry.coordinates;
        const deltaLng = (nextLng - previousLng) * lngScale;
        const deltaLat = nextLat - previousLat;
        const distanceSq = deltaLng * deltaLng + deltaLat * deltaLat;
        if (distanceSq > maxDistSq) continue;

        const previousCount = previousFeature.properties.pointCount;
        const countDelta =
          Math.abs(nextCount - previousCount) /
          Math.max(nextCount, previousCount, 1);
        const score = distanceSq + countDelta * 0.00005;
        if (score < bestScore) {
          bestScore = score;
          bestKey = previousId;
        }
      }

      if (bestKey) {
        usedPreviousIds.add(bestKey);
      }

      return bestKey;
    };

    for (const feature of nextFeatures) {
      const matchedClusterKey = maybeMatchClusterKey(feature);
      const isCluster = feature.properties.isCluster === true;
      const animationKey =
        clusterSpatialMatching && isCluster
          ? (matchedClusterKey ?? `${featureKey(feature)}:${cycleId}`)
          : (matchedClusterKey ?? featureKey(feature));
      const previous = previousById.get(animationKey);
      if (previous) {
        usedPreviousIds.add(animationKey);
      }
      seenIds.add(animationKey);

      const shouldMorphCluster =
        clusterSpatialMatching &&
        feature.properties.isCluster === true &&
        previous?.properties.isCluster === true;

      const startCoordinates: [number, number] = shouldMorphCluster
        ? [
            previous.geometry.coordinates[0],
            previous.geometry.coordinates[1],
          ]
        : [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
      const targetCoordinates: [number, number] = [
        feature.geometry.coordinates[0],
        feature.geometry.coordinates[1],
      ];

      const startRadius = shouldMorphCluster
        ? getClusterRadius(previous)
        : getClusterRadius(feature);
      const targetRadius = getClusterRadius(feature);
      const startPointCount = shouldMorphCluster
        ? getClusterPointCount(previous)
        : getClusterPointCount(feature);
      const targetPointCount = getClusterPointCount(feature);

      animated.push({
        animationKey,
        feature,
        startOpacity: previous?.properties.transitionOpacity ?? 0,
        targetOpacity: 1,
        startCoordinates,
        targetCoordinates,
        startRadius,
        targetRadius,
        startPointCount,
        targetPointCount,
        removeAtEnd: false,
      });
    }

    for (const previousFeature of previousFeatures) {
      const id = featureKey(previousFeature);
      if (!seenIds.has(id)) {
        const previousCoordinates: [number, number] = [
          previousFeature.geometry.coordinates[0],
          previousFeature.geometry.coordinates[1],
        ];
        const previousRadius = getClusterRadius(previousFeature);
        const previousPointCount = getClusterPointCount(previousFeature);

        animated.push({
          animationKey: id,
          feature: previousFeature,
          startOpacity: previousFeature.properties.transitionOpacity,
          targetOpacity: 0,
          startCoordinates: previousCoordinates,
          targetCoordinates: previousCoordinates,
          startRadius: previousRadius,
          targetRadius: previousRadius,
          startPointCount: previousPointCount,
          targetPointCount: previousPointCount,
          removeAtEnd: true,
        });
      }
    }

    const featureAtProgress = (
      item: AnimatedFeature,
      progress: number,
    ): TransitionedFeature => {
      const opacity =
        item.startOpacity + (item.targetOpacity - item.startOpacity) * progress;
      const coordinates: [number, number] = [
        item.startCoordinates[0] +
          (item.targetCoordinates[0] - item.startCoordinates[0]) * progress,
        item.startCoordinates[1] +
          (item.targetCoordinates[1] - item.startCoordinates[1]) * progress,
      ];

      const animatedRadius =
        typeof item.startRadius === "number" &&
        typeof item.targetRadius === "number"
          ? item.startRadius + (item.targetRadius - item.startRadius) * progress
          : item.targetRadius ?? item.startRadius;

      const animatedPointCount =
        typeof item.startPointCount === "number" &&
        typeof item.targetPointCount === "number"
          ? item.startPointCount +
            (item.targetPointCount - item.startPointCount) * progress
          : item.targetPointCount ?? item.startPointCount;

      return withTransitionOpacity(
        item.feature,
        opacity,
        item.animationKey,
        animatedRadius,
        animatedPointCount,
        coordinates,
      );
    };

    setRenderedAndRef(
      animated.map((item) => featureAtProgress(item, 0)),
    );

    const hasAnimation = animated.some(
      (item) =>
        item.startOpacity !== item.targetOpacity ||
        item.startCoordinates[0] !== item.targetCoordinates[0] ||
        item.startCoordinates[1] !== item.targetCoordinates[1] ||
        item.startRadius !== item.targetRadius ||
        item.startPointCount !== item.targetPointCount,
    );

    if (!hasAnimation) {
      setRenderedAndRef(
        animated
          .filter((item) => !item.removeAtEnd)
          .map((item) => featureAtProgress(item, 1)),
      );
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(elapsed / ENTER_EXIT_ANIMATION_MS, 1);

      setRenderedAndRef(
        animated
          .map((item) => featureAtProgress(item, progress))
          .filter((feature) => feature.properties.transitionOpacity > 0.001),
      );

      if (progress < 1) {
        animationRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      animationRafRef.current = null;
      setRenderedAndRef(
        animated
          .filter((item) => !item.removeAtEnd)
          .map((item) => featureAtProgress(item, 1)),
      );
    };

    animationRafRef.current = window.requestAnimationFrame(tick);
  }, [nextFeatures]);

  useEffect(
    () => () => {
      if (animationRafRef.current !== null) {
        window.cancelAnimationFrame(animationRafRef.current);
      }
    },
    [],
  );

  const data: TransitionedCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: renderedFeatures,
    }),
    [renderedFeatures],
  );

  return data;
}

const poiLayout: SymbolLayerSpecification["layout"] = {
  "icon-image": ["get", "pinImageName"],
  "icon-size": 0.85,
  "icon-anchor": "bottom",
  "icon-allow-overlap": true,
  "text-field": ["get", "name"],
  "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 11, 18, 12],
  "text-variable-anchor": ["right", "left"],
  "text-radial-offset": 1.4,
  "text-justify": "auto",
  "text-max-width": 7,
  "text-optional": true,
  "text-allow-overlap": false,
  "symbol-sort-key": ["*", ["get", "sortKey"], -1],
};

const clusterGlowLayer: CircleLayerSpecification = {
  id: LAYER_IDS.CLUSTER_GLOW,
  type: "circle",
  source: CLUSTER_SOURCE_ID,
  paint: {
    "circle-radius": ["*", ["coalesce", ["get", "animatedRadius"], ["get", "radius"]], 2.2],
    "circle-radius-transition": transition,
    "circle-color": "#5c6bc0",
    "circle-blur": 1,
    "circle-opacity": ["*", 0.13, ["get", "transitionOpacity"]],
    "circle-opacity-transition": transition,
  },
};

const clusterCoreLayer: CircleLayerSpecification = {
  id: LAYER_IDS.CLUSTER_CIRCLES,
  type: "circle",
  source: CLUSTER_SOURCE_ID,
  paint: {
    "circle-radius": ["coalesce", ["get", "animatedRadius"], ["get", "radius"]],
    "circle-radius-transition": transition,
    "circle-color": "#5c6bc0",
    "circle-blur": 0.35,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "rgba(255, 255, 255, 0.7)",
    "circle-opacity": ["*", 0.42, ["get", "transitionOpacity"]],
    "circle-opacity-transition": transition,
  },
};

const clusterLabelsLayer: SymbolLayerSpecification = {
  id: LAYER_IDS.CLUSTER_LABELS,
  type: "symbol",
  source: CLUSTER_SOURCE_ID,
  layout: {
    "text-field": ["get", "displayCount"],
    "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
    "text-size": [
      "step",
      ["coalesce", ["get", "animatedPointCount"], ["get", "pointCount"]],
      10,
      10,
      11,
      100,
      12,
      1000,
      14,
    ],
    "text-allow-overlap": true,
  },
  paint: {
    "text-color": "#fff",
    "text-opacity": ["get", "transitionOpacity"],
    "text-opacity-transition": transition,
  },
};

export function POISymbolLayer({
  items,
  filters,
  isDarkMode,
  currentZoom,
}: POISymbolLayerProps) {
  const allGeoJson = useMemo(
    () => transformToGeoJSON(items, filters),
    [items, filters],
  );

  const { poiFeatures, clusterFeatures } = useMemo(() => {
    const poi: BaseFeature[] = [];
    const clusters: BaseFeature[] = [];

    for (const feature of allGeoJson.features) {
      if (feature.properties.isCluster === true) {
        clusters.push(feature);
      } else {
        poi.push(feature);
      }
    }

    return { poiFeatures: poi, clusterFeatures: clusters };
  }, [allGeoJson]);

  const poiData = useTransitionedCollection(poiFeatures);
  const clusterData = useTransitionedCollection(clusterFeatures, {
    clusterSpatialMatching: true,
    currentZoom,
  });

  const poiLayer: SymbolLayerSpecification = useMemo(
    () => ({
      id: LAYER_IDS.POI_PINS,
      type: "symbol",
      source: SOURCE_IDS.POIS,
      layout: poiLayout,
      paint: {
        "icon-opacity": [
          "*",
          ["get", "opacity"],
          ["get", "transitionOpacity"],
        ],
        "icon-opacity-transition": transition,
        "text-color": isDarkMode
          ? [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#8ab4f8",
              "#e0e0e0",
            ]
          : [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#1a73e8",
              ["get", "itemTypeColor"],
            ],
        "text-halo-color": isDarkMode ? "rgba(0, 0, 0, 0.8)" : "#fff",
        "text-halo-width": 1.5,
        "text-opacity": [
          "*",
          ["get", "opacity"],
          ["get", "transitionOpacity"],
        ],
        "text-opacity-transition": transition,
        "text-translate": [0, -19],
      },
    }),
    [isDarkMode],
  );

  return (
    <>
      <Source id={CLUSTER_SOURCE_ID} type="geojson" data={clusterData}>
        <Layer {...clusterGlowLayer} />
        <Layer {...clusterCoreLayer} />
        <Layer {...clusterLabelsLayer} />
      </Source>

      <Source id={SOURCE_IDS.POIS} type="geojson" data={poiData} promoteId="id">
        <Layer {...poiLayer} />
      </Source>
    </>
  );
}
