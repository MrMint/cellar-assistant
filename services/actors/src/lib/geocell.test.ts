/**
 * `geocell.ts`'s one property — a point within `r` of `A` falls in a cell of
 * `geocellsWithin(A, r)` — checked by brute force, with the antimeridian and
 * the poles sampled on purpose rather than hoped for.
 */
import { describe, expect, it } from "vitest";
import {
  ADVISORY_LOCK_NAMESPACE,
  advisoryLockKey,
  compareAdvisoryLockKeys,
} from "./advisory-locks.ts";
import {
  colsIn,
  GEOCELL_MAX_LOCKS,
  GEOCELL_ROWS,
  type Geocell,
  geocellOf,
  geocellsWithin,
} from "./geocell.ts";

/** WGS84's equatorial radius — the largest, so a step on it is the longest. */
const EARTH_RADIUS = 6_378_137;
const DEG = Math.PI / 180;

/** The point `meters` from `origin` along `bearing` (great circle). */
const destination = (
  origin: { lng: number; lat: number },
  bearingDeg: number,
  meters: number,
): { lng: number; lat: number } => {
  const angular = meters / EARTH_RADIUS;
  const bearing = bearingDeg * DEG;
  const lat1 = origin.lat * DEG;
  const lng1 = origin.lng * DEG;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  const lng = ((((lng2 / DEG + 180) % 360) + 360) % 360) - 180;
  return { lng, lat: lat2 / DEG };
};

/** A tiny deterministic PRNG, so a failure names a reproducible case. */
const prng = (seed: number) => () => {
  seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
  return seed / 2 ** 32;
};

const has = (cells: readonly Geocell[], cell: Geocell): boolean =>
  cells.some((c) => c.row === cell.row && c.col === cell.col);

const RADIUS = 50;

describe("geocell", () => {
  it("every point within the radius falls in one of A's cells — random, antimeridian and polar origins", () => {
    const random = prng(20260928);
    const origins: Array<{ lng: number; lat: number }> = [
      { lng: 179.99995, lat: 0 },
      { lng: -179.99995, lat: 0 },
      { lng: 180, lat: 51.5 },
      { lng: -180, lat: -33.9 },
      { lng: 0, lat: 89.9999 },
      { lng: 123.4, lat: -89.9999 },
      { lng: 45, lat: 90 },
      { lng: -45, lat: -90 },
      { lng: -122.4194, lat: 37.7749 },
    ];
    for (let i = 0; i < 4000; i += 1) {
      origins.push({ lng: random() * 360 - 180, lat: random() * 180 - 90 });
    }

    let checked = 0;
    for (const origin of origins) {
      const cells = geocellsWithin(origin, RADIUS);
      expect(has(cells, geocellOf(origin))).toBe(true);
      for (let j = 0; j < 12; j += 1) {
        // Just under the radius: the case the lock exists for.
        const other = destination(origin, random() * 360, RADIUS * random());
        const cell = geocellOf(other);
        if (!has(cells, cell)) {
          throw new Error(
            `${JSON.stringify(other)} (cell ${JSON.stringify(cell)}) is within ` +
              `${RADIUS}m of ${JSON.stringify(origin)} but not in its cells ` +
              JSON.stringify(cells),
          );
        }
        checked += 1;
      }
    }
    expect(checked).toBe(origins.length * 12);
  });

  it("two near-duplicates straddling a cell boundary lock a common cell, and a far pair does not", () => {
    // Walk east from SF until the column changes: the last point of the old
    // column and the first of the new are a metre apart and in different cells.
    let a = { lng: -122.4194, lat: 37.7749 };
    let b = destination(a, 90, 1);
    while (geocellOf(b).col === geocellOf(a).col) {
      a = b;
      b = destination(a, 90, 1);
    }
    expect(geocellOf(a)).not.toEqual(geocellOf(b));
    const shared = geocellsWithin(a, RADIUS).filter((cell) =>
      has(geocellsWithin(b, RADIUS), cell),
    );
    expect(shared.length).toBeGreaterThan(0);

    // A kilometre away shares nothing: unrelated creations do not queue.
    const far = destination(a, 90, 1000);
    expect(
      geocellsWithin(a, RADIUS).filter((cell) =>
        has(geocellsWithin(far, RADIUS), cell),
      ),
    ).toEqual([]);
  });

  it("the antimeridian: ±180 are one cell, and a creation beside it locks the far side's column 0", () => {
    const row = geocellOf({ lng: 180, lat: 10 }).row;
    expect(geocellOf({ lng: 180, lat: 10 })).toEqual(
      geocellOf({ lng: -180, lat: 10 }),
    );
    const east = geocellsWithin({ lng: 179.99999, lat: 10 }, RADIUS);
    expect(has(east, { row, col: 0 })).toBe(true);
    expect(has(east, { row, col: colsIn(row) - 1 })).toBe(true);
  });

  it("the poles: the polar row is one cell, and a creation at the pole takes every column of the rows it touches", () => {
    expect(colsIn(GEOCELL_ROWS - 1)).toBe(1);
    expect(colsIn(0)).toBe(1);
    const north = geocellsWithin({ lng: 12, lat: 90 }, RADIUS);
    const rows = new Set(north.map((cell) => cell.row));
    for (const row of rows) {
      expect(north.filter((cell) => cell.row === row)).toHaveLength(
        colsIn(row),
      );
    }
  });

  it(`takes at most ${GEOCELL_MAX_LOCKS} locks anywhere, and at most 4 away from the poles`, () => {
    let worst = 0;
    let worstAwayFromPoles = 0;
    for (let lat = -90; lat <= 90; lat += 0.0037) {
      for (const lng of [-180, -179.99995, 0, 77.7, 179.99995]) {
        const n = geocellsWithin({ lng, lat }, RADIUS).length;
        worst = Math.max(worst, n);
        if (Math.abs(lat) < 89) {
          worstAwayFromPoles = Math.max(worstAwayFromPoles, n);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(GEOCELL_MAX_LOCKS);
    expect(worstAwayFromPoles).toBeLessThanOrEqual(4);
  });

  it("builds int4 lock keys in their own namespace, ordered row-major", () => {
    const top = { row: GEOCELL_ROWS - 1, col: 0 };
    const mid = Math.floor(GEOCELL_ROWS / 2);
    const widest = { row: mid, col: colsIn(mid) - 1 };
    for (const cell of [top, widest]) {
      const [first, second] = advisoryLockKey(
        ADVISORY_LOCK_NAMESPACE.placeGeocell,
        cell.row,
        cell.col,
      );
      expect(first).toBeLessThan(2 ** 31);
      expect(second).toBeLessThan(2 ** 31);
    }
    expect(
      compareAdvisoryLockKeys(
        advisoryLockKey(ADVISORY_LOCK_NAMESPACE.placeGeocell, 5, 9),
        advisoryLockKey(ADVISORY_LOCK_NAMESPACE.placeGeocell, 6, 0),
      ),
    ).toBeLessThan(0);
    expect(() =>
      advisoryLockKey(ADVISORY_LOCK_NAMESPACE.placeGeocell, 2 ** 20, 0),
    ).toThrow(RangeError);
  });
});
