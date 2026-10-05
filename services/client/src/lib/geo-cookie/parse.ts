export const GEOLOCATION_COOKIE_NAME = "user_location";
export const GEOLOCATION_COOKIE_MAX_AGE = 86400; // 24 hours

export interface CachedLocation {
  latitude: number;
  longitude: number;
}

/**
 * Parse a "lat,lng" cookie value into a validated location object.
 * Returns null on any parse failure or out-of-range values.
 */
export function parseGeolocationCookie(
  value: string | undefined,
): CachedLocation | null {
  if (!value) return null;

  const parts = value.split(",");
  if (parts.length !== 2) return null;

  const [rawLatitude, rawLongitude] = parts;
  // `Number("")` is `0`, not `NaN` — without this check "," (or ",1") would
  // parse as valid coordinates instead of being rejected as malformed.
  if (rawLatitude.trim() === "" || rawLongitude.trim() === "") return null;

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}
