import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GEOLOCATION_COOKIE_MAX_AGE,
  GEOLOCATION_COOKIE_NAME,
  parseGeolocationCookie,
} from "./parse.ts";

// D5c: `/map` and `/map/create-place` trust whatever this function returns as
// `initialCenter`. It is the entire validation boundary between an
// attacker-supplied `Cookie` header and coordinates handed to the map, so
// these three shapes — present or absent, and mainly, someone hand-crafted a
// header — are exactly what the fix's spec asked to cover.

test("cookie present: parses a valid 'lat,lng' value", () => {
  assert.deepEqual(parseGeolocationCookie("37.7749,-122.4194"), {
    latitude: 37.7749,
    longitude: -122.4194,
  });
});

test("cookie present: accepts boundary latitude/longitude values", () => {
  assert.deepEqual(parseGeolocationCookie("90,-180"), {
    latitude: 90,
    longitude: -180,
  });
  assert.deepEqual(parseGeolocationCookie("-90,180"), {
    latitude: -90,
    longitude: 180,
  });
  assert.deepEqual(parseGeolocationCookie("0,0"), {
    latitude: 0,
    longitude: 0,
  });
});

test("cookie absent: undefined and empty string both return null", () => {
  assert.equal(parseGeolocationCookie(undefined), null);
  assert.equal(parseGeolocationCookie(""), null);
});

test("malformed cookie: wrong number of parts is rejected", () => {
  assert.equal(parseGeolocationCookie("37.7749"), null);
  assert.equal(parseGeolocationCookie("37.7749,-122.4194,13"), null);
});

test("malformed cookie: non-numeric parts are rejected, not coerced", () => {
  assert.equal(parseGeolocationCookie("abc,def"), null);
  assert.equal(parseGeolocationCookie("NaN,NaN"), null);
  assert.equal(parseGeolocationCookie("Infinity,-Infinity"), null);
});

test("malformed cookie: out-of-range coordinates are rejected", () => {
  assert.equal(parseGeolocationCookie("91,0"), null);
  assert.equal(parseGeolocationCookie("-91,0"), null);
  assert.equal(parseGeolocationCookie("0,181"), null);
  assert.equal(parseGeolocationCookie("0,-181"), null);
});

test("malformed cookie: an attacker-supplied payload does not crash and is not trusted", () => {
  // Things a hostile `Cookie:` header could plausibly carry: script-injection
  // attempts, absurdly long numeric strings, and JSON masquerading as the
  // expected shape. None of this should throw, and none of it should ever
  // reach the map as coordinates.
  assert.equal(parseGeolocationCookie("<script>alert(1)</script>,0"), null);
  assert.equal(parseGeolocationCookie("1e400,1e400"), null);
  assert.equal(
    parseGeolocationCookie('{"latitude":37.7749,"longitude":-122.4194}'),
    null,
  );
});

test("malformed cookie: an empty part is rejected rather than coerced to 0", () => {
  // `Number("")` is `0`, not `NaN` — a naive `Number.isFinite` check alone
  // would trust "," as valid coordinates (0, 0).
  assert.equal(parseGeolocationCookie(","), null);
  assert.equal(parseGeolocationCookie(",1"), null);
  assert.equal(parseGeolocationCookie("1,"), null);
});

test("the cookie contract used by the reader and writer matches", () => {
  // The read side (`server.ts`) and the write side (`client.ts`) both import
  // these two constants rather than hardcoding the name/TTL a second time —
  // guard the values themselves so a future edit to one side is forced to
  // touch this test.
  assert.equal(GEOLOCATION_COOKIE_NAME, "user_location");
  assert.equal(GEOLOCATION_COOKIE_MAX_AGE, 86400);
});
