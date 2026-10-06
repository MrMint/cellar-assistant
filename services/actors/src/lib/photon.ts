/**
 * The Photon seam — C1 (§2.3 `GeocodeActor`).
 *
 * Photon (`photon.komoot.io`) is komoot's public OSM geocoder, and it is the
 * one **external HTTP service** C1 touches that is not Google. `GeocodeActor`
 * holds this interface rather than calling `fetch`, for the reason B5's
 * `GooglePlacesClient` and B7's `InsightsGenerator` exist: the no-Dapr harness
 * must never reach the network, and a live third-party service in a unit test
 * is a flake generator and a rate-limit incident waiting to happen.
 *
 * ## The default throws, loudly
 *
 * `unconfiguredPhotonClient` raises rather than returning `null`. `null` is a
 * *meaningful* answer here — "this address does not exist" — so a default that
 * returned it would make a misconfigured deployment look exactly like a world
 * where every address is unknown, and the map's address short-circuit would
 * silently stop working with no error anywhere. Same rule B7 set; the reason is
 * sharper in this case because the success type is nullable.
 *
 * `photonClient()` is what `GeocodeActor`'s constructor defaults to (X5) — it
 * reads `PHOTON_BASE_URL`, falling back to the public instance, and always
 * returns the real `httpPhotonClient()` since (unlike Google Places) there is
 * no API key that could be missing. `unconfiguredPhotonClient` only appears
 * where a caller passes it explicitly — every test in `geocode-actor.test.ts`
 * does, on purpose, so a test that forgets to inject its own fake fails loudly
 * instead of hitting komoot.
 *
 * ## Behaviour ported from `src/lib/cache/index.ts`
 *
 * - forward: `?q=…&limit=1`, 3s timeout, `User-Agent: CellarAssistant/1.0`;
 * - **the specificity filter**: a forward result is accepted only when its
 *   `type` is one of house, street, locality, district, postcode. This is what
 *   stops "Ohio" from being treated as an address and flying the map to a
 *   state centroid instead of running a place search;
 * - the display name is `housenumber street` (or `street`, or `name`), then
 *   city, then state, joined with ", ", falling back to the query;
 * - reverse: `/reverse?lon=&lat=&limit=1`, same timeout, address components
 *   with an upper-cased country code;
 * - any failure — non-2xx, timeout, malformed JSON — is `null`.
 */
import { ConflictError } from "@cellar-assistant/contracts";

export type PhotonForward = {
  readonly latitude: number;
  readonly longitude: number;
  readonly displayName: string;
} | null;

export type PhotonReverse = {
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly postcode: string | null;
  readonly countryCode: string | null;
} | null;

export type PhotonClient = {
  forward(query: string): Promise<PhotonForward>;
  reverse(location: {
    readonly lng: number;
    readonly lat: number;
  }): Promise<PhotonReverse>;
};

const unconfigured = (operation: string): never => {
  throw new ConflictError(
    `GeocodeActor has no geocoder wired, so it cannot ${operation}. Inject a ` +
      "PhotonClient through the actor's constructor — `photonClient()` is the " +
      "production one. This throws rather than returning null because null is " +
      'a real answer here ("no such address"), so a silent default would ' +
      "make a misconfigured deployment indistinguishable from a world where " +
      "every address is unknown.",
  );
};

export const unconfiguredPhotonClient: PhotonClient = {
  forward: async () => unconfigured("geocode an address"),
  reverse: async () => unconfigured("reverse-geocode a coordinate"),
};

/** Only these are specific enough to fly the map to (`looksLikeAddress`). */
const SPECIFIC_TYPES = new Set([
  "house",
  "street",
  "locality",
  "district",
  "postcode",
]);

const TIMEOUT_MS = 3000;
const USER_AGENT = "CellarAssistant/1.0";

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
};

/** Exported for its own tests: the shaping is pure, the fetching is not. */
export const toForward = (
  feature: Feature | undefined,
  query: string,
): PhotonForward => {
  if (feature === undefined) return null;
  const properties = feature.properties ?? {};
  if (properties.type !== undefined && !SPECIFIC_TYPES.has(properties.type)) {
    return null;
  }
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates;

  const parts: string[] = [];
  if (properties.housenumber !== undefined && properties.street !== undefined) {
    parts.push(`${properties.housenumber} ${properties.street}`);
  } else if (properties.street !== undefined) {
    parts.push(properties.street);
  } else if (properties.name !== undefined) {
    parts.push(properties.name);
  }
  if (properties.city !== undefined) parts.push(properties.city);
  if (properties.state !== undefined) parts.push(properties.state);

  return {
    latitude,
    longitude,
    displayName: parts.join(", ") || query,
  };
};

export const toReverse = (feature: Feature | undefined): PhotonReverse => {
  if (feature === undefined) return null;
  const properties = feature.properties ?? {};
  const street = [properties.housenumber, properties.street]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ");
  return {
    streetAddress: street === "" ? null : street,
    locality: properties.city ?? null,
    region: properties.state ?? null,
    postcode: properties.postcode ?? null,
    countryCode: properties.countrycode?.toUpperCase() ?? null,
  };
};

export const httpPhotonClient = (baseUrl: string): PhotonClient => {
  const get = async (path: string): Promise<Feature | undefined> => {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { features?: Feature[] };
      return body.features?.[0];
    } catch {
      // Every failure is "no result", exactly as `getCachedGeocode` does: a
      // geocoder being down must not break a map search that would have
      // fallen through to a place search anyway.
      return undefined;
    }
  };

  return {
    forward: async (query) =>
      toForward(
        await get(`/api/?q=${encodeURIComponent(query)}&limit=1`),
        query,
      ),
    reverse: async ({ lng, lat }) =>
      toReverse(await get(`/reverse?lon=${lng}&lat=${lat}&limit=1`)),
  };
};

export const PHOTON_DEFAULT_BASE_URL = "https://photon.komoot.io";

export const photonClient = (): PhotonClient =>
  httpPhotonClient(process.env.PHOTON_BASE_URL ?? PHOTON_DEFAULT_BASE_URL);
