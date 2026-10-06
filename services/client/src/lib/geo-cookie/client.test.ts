import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseGeolocationCookie } from "./parse.ts";

// `client.ts` touches `document.cookie` and `globalThis.location` at call
// time only (not at module load), so a minimal fake of both — this is a
// plain Node test file, there is no DOM — is enough to exercise the real
// writer rather than re-implementing its string-building logic here.

let lastCookieWrite: string | null = null;

function installFakeDocument(protocol: "http:" | "https:"): void {
  lastCookieWrite = null;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      set cookie(value: string) {
        lastCookieWrite = value;
      },
    },
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "location");
});

test("writes a cookie the reader can parse back to the same coordinates", async () => {
  installFakeDocument("https:");
  const { setGeolocationCookie } = await import("./client.ts");

  setGeolocationCookie(37.774_929_3, -122.419_415_6);

  assert.ok(lastCookieWrite !== null);
  const written = lastCookieWrite as string;
  assert.match(written, /^user_location=/);

  const value = written.split(";")[0]?.split("=")[1];
  const parsed = parseGeolocationCookie(value);
  assert.ok(parsed !== null);
  // Rounded to 4 decimal places (~11m precision), per the writer's contract.
  assert.equal(parsed?.latitude, 37.7749);
  assert.equal(parsed?.longitude, -122.4194);
});

test("marks the cookie Secure on https, and not on plain http", async () => {
  installFakeDocument("https:");
  const { setGeolocationCookie: setSecure } = await import("./client.ts");
  setSecure(1, 2);
  assert.match(lastCookieWrite ?? "", /; Secure/);

  installFakeDocument("http:");
  const { setGeolocationCookie: setPlain } = await import("./client.ts");
  setPlain(1, 2);
  assert.doesNotMatch(lastCookieWrite ?? "", /; Secure/);
});

test("sets a 24h max-age and SameSite=Strict, matching GEOLOCATION_COOKIE_MAX_AGE", async () => {
  installFakeDocument("https:");
  const { setGeolocationCookie } = await import("./client.ts");
  setGeolocationCookie(0, 0);
  assert.match(lastCookieWrite ?? "", /max-age=86400/);
  assert.match(lastCookieWrite ?? "", /SameSite=Strict/);
});
