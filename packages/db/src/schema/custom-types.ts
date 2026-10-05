/**
 * Typed `customType` wrappers (migration-plan.md §6 A3, §8.6; target-stack.md §2).
 *
 * `drizzle-kit@1.0.0-rc.4 pull` introspects `geography`, `geometry`, `tsvector`
 * and `money` as untyped `customType(...)` placeholders — see
 * `../../README.md` and `docs/architecture/target-stack.md` §2. `money` no
 * longer needs one (`transform/05_money_to_numeric.sql` converts
 * `place_menu_items.menu_item_price` to `numeric(10,2)`, which Drizzle models
 * natively), leaving exactly three surviving columns that need a real type:
 *
 *   - `places.location`        geography(Point,4326)
 *   - `places.search_text`     tsvector
 *   - `menu_scans.scan_location` geography(Point,4326)
 *
 * `tables.ts` is generator output (see `../../README.md`); wiring these in
 * there is hand-edit #4 in that file's "Hand-edits to re-apply after every
 * re-pull" list. This module is the thing being wired in, kept separate so a
 * re-pull only has to re-apply two import lines, not regenerate this logic.
 */

import { customType } from "drizzle-orm/pg-core";

type LngLat = { lng: number; lat: number };

/**
 * PostGIS `geography(Point,4326)`.
 *
 * Every geography column in this schema is `geography(Point,4326)` — no other
 * geometry type or SRID is used anywhere in `tables.ts` — so this wrapper only
 * handles points and only handles SRID 4326. It is not a general-purpose
 * PostGIS type.
 *
 * Writes: `toDriver` sends plain WKT (`POINT(lng lat)`), no `SRID=` prefix.
 * Geography's input function defaults an SRID-less WKT literal to 4326 (unlike
 * `geometry`, whose default is 0), which matches the column's typmod — this is
 * why WKT is enough and no `ST_SetSRID`/`ST_MakePoint` call is needed here.
 * Verified against a `geography(Point,4326)` column: `'POINT(-122.4194
 * 37.7749)'` round-trips to `ST_SRID = 4326`.
 *
 * Reads: `fromDriver` decodes the little-endian EWKB hex string Postgres
 * returns by default for a `geography` column in text mode (confirmed
 * 2026-09-08: `select location from places` returns e.g.
 * `0101000020E6100000...`, not WKT). PostGIS always emits byte-order `01`
 * (little-endian); this parser does not handle `00` (big-endian) because
 * nothing in this stack ever produces it.
 */
export const geography = customType<{
  data: LngLat;
  driverData: string;
}>({
  dataType() {
    return "geography(Point,4326)";
  },
  toDriver(value) {
    return `POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value) {
    return decodeEwkbPoint(value);
  },
});

/**
 * Postgres `tsvector`.
 *
 * `data` is the canonical tsvector string representation (e.g. `"'bar':4
 * 'hello':1"`) — the exact text Postgres both accepts as input (a `tsvector`
 * literal) and returns as output (confirmed 2026-09-08), so no encode/decode
 * is needed. This wrapper exists purely to give `places.search_text` a real
 * TypeScript type (`string`) instead of the untyped placeholder `pull` leaves
 * behind; it does not compute a tsvector from plain text — callers building
 * `search_text` should do that in SQL (`to_tsvector(...)`), same as today.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Decodes a little-endian EWKB `POINT` (with or without the SRID flag) from
 * the hex string Postgres returns for a `geography`/`geometry` column.
 *
 * Layout (all little-endian, matching PostGIS's own output):
 *   byte 0      : byte order (`01` = little-endian; big-endian is not handled)
 *   bytes 1-4   : geometry type + flag bits (bit 0x20000000 = "has SRID")
 *   bytes 5-8   : SRID, only present when the has-SRID flag is set
 *   next 8 bytes: X (longitude) as a float64
 *   next 8 bytes: Y (latitude) as a float64
 */
function decodeEwkbPoint(hex: string): LngLat {
  const bytes = hexToBytes(hex);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = view.getUint8(0) === 1;
  const typeAndFlags = view.getUint32(1, littleEndian);
  const hasSrid = (typeAndFlags & 0x20000000) !== 0;
  const offset = hasSrid ? 1 + 4 + 4 : 1 + 4;
  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  return { lng, lat };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
