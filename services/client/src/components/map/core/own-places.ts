/**
 * The viewer's own places on the map, wherever the view is (F-33, F-34,
 * F-191): where the map first opens, how many of yours lie beyond the view
 * and past which edge, and the chip a list's `/map?list=` link shows.
 *
 * The points come from a whole-world `mapBrowse` filtered to the lists, so a
 * far-off group may arrive as a cluster: its centre and its count stand in
 * for the places in it.
 */

import type { MapBounds, MapDataItem } from "../types";

export type OwnPoint = {
  readonly lng: number;
  readonly lat: number;
  readonly count: number;
};

export type Edges = {
  readonly left: number;
  readonly right: number;
  readonly up: number;
  readonly down: number;
};

/** The whole world, as `mapBrowse` takes it (Web Mercator's latitudes). */
export const WORLD_BOUNDS: MapBounds = {
  west: -180,
  east: 180,
  south: -85,
  north: 85,
};

export function pointsFrom(items: readonly MapDataItem[]): OwnPoint[] {
  return items.map((item) => {
    if ("is_cluster" in item) {
      const [lng, lat] = item.cluster_center.coordinates;
      return { lng, lat, count: item.cluster_count };
    }
    const [lng, lat] = item.location.coordinates;
    return { lng, lat, count: 1 };
  });
}

const inside = (point: OwnPoint, view: MapBounds): boolean =>
  point.lat <= view.north &&
  point.lat >= view.south &&
  point.lng <= view.east &&
  point.lng >= view.west;

export type Edge = keyof Edges;

/**
 * The edge of `view` a point lies past, or null inside it: the one it is
 * furthest past, measured in half-views from the centre.
 */
export function edgeOf(point: OwnPoint, view: MapBounds): Edge | null {
  if (inside(point, view)) return null;
  const hw = Math.max((view.east - view.west) / 2, Number.EPSILON);
  const hh = Math.max((view.north - view.south) / 2, Number.EPSILON);
  const dx = (point.lng - (view.west + view.east) / 2) / hw;
  const dy = (point.lat - (view.south + view.north) / 2) / hh;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy > 0 ? "up" : "down";
}

/** How many of yours lie outside `view`, and past which edge. */
export function beyondView(
  points: readonly OwnPoint[],
  view: MapBounds,
): { total: number; edges: Edges; points: OwnPoint[] } {
  const edges = { left: 0, right: 0, up: 0, down: 0 };
  const outside: OwnPoint[] = [];
  for (const point of points) {
    const edge = edgeOf(point, view);
    if (edge === null) continue;
    outside.push(point);
    edges[edge] += point.count;
  }
  return {
    total: edges.left + edges.right + edges.up + edges.down,
    edges,
    points: outside,
  };
}

/** The edge most of them lie past, for the beyond chip's arrow. */
export function mainEdge(edges: Edges): Edge | null {
  const order: Edge[] = ["up", "right", "down", "left"];
  let best: Edge | null = null;
  for (const edge of order) {
    if (edges[edge] > 0 && (best === null || edges[edge] > edges[best])) {
      best = edge;
    }
  }
  return best;
}

export function extentOf(points: readonly OwnPoint[]): MapBounds | null {
  if (points.length === 0) return null;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const { lng, lat } of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, east, south, north };
}

export type MapMove =
  | { kind: "fit"; bounds: MapBounds }
  | { kind: "center"; longitude: number; latitude: number };

/** Where to take the map to show `extent`: a box, or one point's centre. */
export function moveTo(extent: MapBounds): MapMove {
  return extent.west === extent.east && extent.south === extent.north
    ? { kind: "center", longitude: extent.west, latitude: extent.south }
    : { kind: "fit", bounds: extent };
}

/**
 * The map's first move once your places are known: none when you are
 * located (the map opens on you) unless a list's link opened it, which
 * always opens on the list.
 */
export function firstView({
  extent,
  located,
  list,
}: {
  extent: MapBounds | null;
  located: boolean;
  list: boolean;
}): MapMove | null {
  if (extent === null) return null;
  if (located && !list) return null;
  return moveTo(extent);
}

/**
 * The chip a `/map?list=<id>` link shows in place of "Mine": the list's own
 * name, and whether it is one of the viewer's (a friend's list never lights
 * Mine, CC-6). Null without a list link.
 */
export function listChip({
  listId,
  list,
  viewerId,
}: {
  listId: string | null;
  list: { name: string; createdById: string } | null;
  viewerId: string | null;
}): { name: string; mine: boolean } | null {
  if (listId === null) return null;
  if (list === null) return { name: "List", mine: false };
  return {
    name: list.name,
    mine: viewerId !== null && list.createdById === viewerId,
  };
}
