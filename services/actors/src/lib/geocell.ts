/**
 * A fixed latitude/longitude grid for one job: turning "any two points closer
 * than `r` metres" into "two sets of cells that share at least one cell", so
 * that `PlaceActor.create` can serialise near-duplicate place creations with
 * advisory locks (`./advisory-locks.ts`) instead of with one global actor.
 *
 * ## The property, and the only thing correctness rests on
 *
 * {@link geocellsWithin}`(A, r)` returns every cell that any point within `r`
 * metres of `A` can fall in. So when `dist(A, B) < r`, A's set contains
 * {@link geocellOf}`(B)` — and B's own set always contains `geocellOf(B)`,
 * because B is within `r` of itself. Two creators that both lock their whole
 * set therefore always share a lock whenever they are close enough to be
 * duplicates of each other, and the second to acquire it re-runs the duplicate
 * check after the first has committed. Cell *size* never enters that argument;
 * it only decides how many locks a creation takes and how much unrelated
 * contention there is.
 *
 * What the argument does need, and what the code below is careful about:
 *
 *  1. **A conservative bounding box.** Latitude: a meridional degree is never
 *     shorter than {@link METERS_PER_DEGREE_LAT_MIN} (WGS84, at the equator),
 *     so no point within `r` is more than `r / that` degrees away in latitude.
 *     Longitude: a parallel degree at latitude φ is `(π/180)·N(φ)·cos φ` with
 *     `N ≥ a`, so never shorter than
 *     {@link METERS_PER_DEGREE_LNG_AT_EQUATOR_MIN}` · cos φ`; the box uses the
 *     cosine of its *most poleward* latitude, which is the smallest. `r` is
 *     further multiplied by {@link GEOCELL_RADIUS_SAFETY} to absorb the
 *     difference between this flat-box reasoning and PostGIS's spheroidal
 *     `ST_Distance` for the tiny distances involved.
 *  2. **Monotone cell functions.** A point inside the box has a row between the
 *     rows of the box's edges and a column between the columns of its edges,
 *     because {@link rowOf} and {@link colOf} are non-decreasing in their
 *     argument (floor of a division by a positive constant, then a clamp). The
 *     enumeration walks exactly those ranges — never "the neighbours", which is
 *     an approximation of the same thing.
 *  3. **The antimeridian**: the box's longitude interval is split where it
 *     crosses ±180°, and each piece is walked separately on the normalised
 *     `[0°, 360°)` axis — so a creation at 179.9999° locks column 0 as well.
 *  4. **The poles**: every row has its own column count, sized so a column is
 *     at least {@link GEOCELL_SIZE_METERS} wide at the row's poleward edge. The
 *     row touching a pole therefore has exactly one column, and a box that
 *     reaches a pole, or whose longitude half-width is 180° or more, simply
 *     takes every column of every row it touches — which near a pole is a
 *     handful, not thousands.
 *
 * ## Why these sizes (the derivation `actor-keys.md` cites)
 *
 * The radius that matters is the duplicate *block* distance, 50 m
 * (`DUPLICATE_BLOCK_DISTANCE_METERS`): `createUserPlaceAction`'s rule refuses a
 * candidate only when it is `> 0.7` similar **and** `< 50 m` away, so two
 * creations further apart than that can never block each other, whatever the
 * 200 m search radius reports as a near-miss. With the 1.5 safety factor the
 * box is 150 m across. A 200 m cell is the smallest round size wider than that
 * box, so the box spans at most two rows and two columns — **at most four
 * locks** away from the poles. Measured over a sweep of every latitude at
 * ~40 m steps, poles and antimeridian included: 1–4 locks away from the
 * poles, 5 at worst beside one; `geocell.test.ts` holds the bound at
 * {@link GEOCELL_MAX_LOCKS}. A larger cell would mean fewer locks and
 * more unrelated creations queueing behind each other for the few
 * milliseconds a lock is held; a smaller one, the reverse. Neither changes
 * what is caught.
 */

/** A grid cell: a latitude row and a longitude column within that row. */
export type Geocell = { readonly row: number; readonly col: number };

/** The minimum on-the-ground width of a cell, in metres. */
export const GEOCELL_SIZE_METERS = 200;

/** Multiplies the radius handed to {@link geocellsWithin} (module doc, 1). */
export const GEOCELL_RADIUS_SAFETY = 1.5;

/** WGS84 meridional degree at the equator — the shortest there is. */
export const METERS_PER_DEGREE_LAT_MIN = 110_574;

/** `a · π / 180`, floored: a parallel degree is at least this `· cos φ`. */
export const METERS_PER_DEGREE_LNG_AT_EQUATOR_MIN = 111_319;

/** A nominal degree, used only to size rows and columns — not for bounds. */
const METERS_PER_DEGREE_NOMINAL = 111_320;

/** Height of one row, in degrees of latitude. */
export const GEOCELL_ROW_DEGREES =
  GEOCELL_SIZE_METERS / METERS_PER_DEGREE_NOMINAL;

/** Rows from the south pole (row 0) to the north pole. */
export const GEOCELL_ROWS = Math.ceil(180 / GEOCELL_ROW_DEGREES);

/**
 * An upper bound on {@link geocellsWithin}'s size for the radii this module is
 * used with, asserted by `geocell.test.ts` over a sweep of latitudes. It exists
 * so a caller can refuse a pathological input rather than take thousands of
 * locks.
 */
export const GEOCELL_MAX_LOCKS = 8;

const DEG = Math.PI / 180;

const clampIndex = (value: number, count: number): number =>
  Math.min(count - 1, Math.max(0, value));

/** The row a latitude falls in. Non-decreasing in `lat`. */
export const rowOf = (lat: number): number =>
  clampIndex(Math.floor((lat + 90) / GEOCELL_ROW_DEGREES), GEOCELL_ROWS);

/** How many columns row `row` is divided into. At least one. */
export const colsIn = (row: number): number => {
  const south = -90 + row * GEOCELL_ROW_DEGREES;
  const north = Math.min(90, south + GEOCELL_ROW_DEGREES);
  const poleward = Math.min(90, Math.max(Math.abs(south), Math.abs(north)));
  const widthAtEdge =
    360 * Math.cos(poleward * DEG) * METERS_PER_DEGREE_NOMINAL;
  return Math.max(1, Math.floor(widthAtEdge / GEOCELL_SIZE_METERS));
};

/** Longitude onto `[0, 360)`. */
const normalizedLng = (lng: number): number => {
  const shifted = (lng + 180) % 360;
  return shifted < 0 ? shifted + 360 : shifted;
};

/**
 * The column a normalised longitude (`[0, 360)`) falls in within `row`.
 * Non-decreasing in `x`.
 */
const colOfNormalized = (row: number, x: number): number => {
  const cols = colsIn(row);
  return clampIndex(Math.floor(x / (360 / cols)), cols);
};

/** The column a longitude falls in within `row`. */
export const colOf = (row: number, lng: number): number =>
  colOfNormalized(row, normalizedLng(lng));

/** The one cell a point falls in. */
export const geocellOf = (location: {
  readonly lng: number;
  readonly lat: number;
}): Geocell => {
  const row = rowOf(location.lat);
  return { row, col: colOf(row, location.lng) };
};

/**
 * Every cell a point within `radiusMeters` of `location` can fall in (module
 * doc). Deterministic, deduplicated, sorted by row then column.
 */
export const geocellsWithin = (
  location: { readonly lng: number; readonly lat: number },
  radiusMeters: number,
): readonly Geocell[] => {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new RangeError(`radiusMeters must be ≥ 0, got ${radiusMeters}`);
  }
  const reach = radiusMeters * GEOCELL_RADIUS_SAFETY;

  const dLat = reach / METERS_PER_DEGREE_LAT_MIN;
  const latMin = Math.max(-90, location.lat - dLat);
  const latMax = Math.min(90, location.lat + dLat);
  const touchesPole = latMin <= -90 || latMax >= 90;
  const poleward = Math.max(Math.abs(latMin), Math.abs(latMax));
  const cosPoleward = Math.cos(poleward * DEG);
  const dLng =
    touchesPole || cosPoleward <= 0
      ? Number.POSITIVE_INFINITY
      : reach / (METERS_PER_DEGREE_LNG_AT_EQUATOR_MIN * cosPoleward);

  // The box's longitude extent as pieces of the normalised [0, 360) axis:
  // one piece normally, two where it crosses the antimeridian, and the whole
  // axis when it is 360° or more wide (at or near a pole).
  const pieces: Array<readonly [number, number]> = [];
  if (dLng >= 180) {
    pieces.push([0, 360]);
  } else {
    const start = normalizedLng(location.lng - dLng);
    const end = start + 2 * dLng;
    if (end < 360) {
      pieces.push([start, end]);
    } else {
      pieces.push([start, 360], [0, end - 360]);
    }
  }

  const cells = new Map<string, Geocell>();
  for (let row = rowOf(latMin); row <= rowOf(latMax); row += 1) {
    for (const [from, to] of pieces) {
      // `to` may be exactly 360 (a piece that runs up to the antimeridian);
      // `colOfNormalized`'s clamp maps it to the row's last column.
      const first = colOfNormalized(row, from);
      const last = colOfNormalized(row, to);
      for (let col = first; col <= last; col += 1) {
        cells.set(`${row}:${col}`, { row, col });
      }
    }
  }
  return [...cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
};
