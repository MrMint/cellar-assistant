import type {
  MapBounds,
  MapDataItem,
  PlaceCluster,
  PlaceResult,
} from "../types";

/** Buffer multiplier: 0.5 = 50% of viewport width/height added on each side */
const VIEWPORT_BUFFER = 0.5;

function getBufferedBounds(bounds: MapBounds): MapBounds {
  const latRange = bounds.north - bounds.south;
  const lngRange = bounds.east - bounds.west;
  const latBuffer = latRange * VIEWPORT_BUFFER;
  const lngBuffer = lngRange * VIEWPORT_BUFFER;
  return {
    north: bounds.north + latBuffer,
    south: bounds.south - latBuffer,
    east: bounds.east + lngBuffer,
    west: bounds.west - lngBuffer,
  };
}

function isInBounds(lat: number, lng: number, buffered: MapBounds): boolean {
  return (
    lat >= buffered.south &&
    lat <= buffered.north &&
    lng >= buffered.west &&
    lng <= buffered.east
  );
}

/**
 * Filters map items to only those within the viewport plus a buffer zone.
 * Reduces the number of mounted Leaflet markers for better pan performance.
 */
export function filterItemsByViewport(
  items: MapDataItem[],
  viewportBounds: MapBounds | undefined,
): MapDataItem[] {
  if (!viewportBounds) return items;
  const buffered = getBufferedBounds(viewportBounds);

  return items.filter((item) => {
    if ("is_cluster" in item && item.is_cluster) {
      const [lng, lat] = (item as PlaceCluster).cluster_center.coordinates;
      return isInBounds(lat, lng, buffered);
    }
    const [lng, lat] = (item as PlaceResult).location.coordinates;
    return isInBounds(lat, lng, buffered);
  });
}
