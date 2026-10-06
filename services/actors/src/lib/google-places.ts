/**
 * The Google Places seam — B5 (migration plan §2.1 `PlaceActor.enrichFromGoogle`,
 * §5's `_utils/google-places` port).
 *
 * `PlaceActor` never calls Google directly. It holds a `GooglePlacesClient`,
 * injected through its constructor exactly the way `FileActor` injects its
 * storage binding and `TierListActor` injects its insights generator — so the
 * in-process test harness substitutes a fake and no test in this repo ever
 * touches the network.
 *
 * ## The default throws, loudly
 *
 * B7 established the rule and this file follows it: the production default is
 * **not** a silent no-op that pretends enrichment succeeded. There are no
 * Google credentials in this development stack, so `googlePlacesClient()`
 * returns `unconfiguredGooglePlacesClient` whenever `GOOGLE_PLACES_API_KEY` is
 * absent, and every method on it throws a `ConflictError` naming the missing
 * variable. A deployment that forgot to configure Google gets a clear failure
 * on the first enrichment, not a database full of empty enrichment rows.
 *
 * ## Auth: an API key here, a service account in the functions this replaces
 *
 * `functions/_utils/google-places/client.ts` authenticates with a GCP service
 * account through `google-auth-library`, minting an OAuth2 bearer token per
 * call. `services/actors` does not depend on `google-auth-library` and B5 did not
 * add it: the Places API (New) accepts a plain `X-Goog-Api-Key` header for
 * every endpoint used here, which needs no dependency and no key-file
 * plumbing. If the deployment must keep using the existing service account
 * instead, inject a client of this shape that mints bearer tokens — that is
 * precisely what the seam is for, and no code in `PlaceActor` changes.
 *
 * ## Costs live here, budget decisions do not
 *
 * `API_COST_CENTS` is copied verbatim from
 * `functions/_utils/google-places/types.ts` (`API_COSTS_CENTS`), because it is
 * a property of Google's price list rather than of either implementation.
 * Nothing in this module checks or logs a budget: the old client called
 * `checkBudget` then `logApiUsage` around each fetch, which is exactly the
 * check-then-log race §2.1 gives `BudgetActor.reserve` to close. `PlaceActor`
 * reserves *before* it calls in here.
 */
import { ConflictError } from "@cellar-assistant/contracts";

const PLACES_API_BASE = "https://places.googleapis.com/v1";

/** `api_budget_config.service` for every endpoint below. */
export const GOOGLE_PLACES_SERVICE = "google_places";

/**
 * Whole cents per call, rounded up, from
 * `functions/_utils/google-places/types.ts`. The keys are
 * `api_budget_config.endpoint` values.
 */
export const API_COST_CENTS = {
  autocomplete: 1,
  nearby_search: 4,
  text_search: 4,
  place_details: 3,
  photo: 1,
} as const;

export type GoogleEndpoint = keyof typeof API_COST_CENTS;

/* -------------------------------------------------------------------------- */
/* What comes back                                                             */
/* -------------------------------------------------------------------------- */

/** One photo reference on a details response. */
export type GooglePhotoRef = {
  /** `places/<id>/photos/<ref>` — the handle `photo()` takes. */
  readonly name: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly authorAttributions?: readonly Record<string, unknown>[];
};

/**
 * The subset of Google's `Place` this aggregate stores, already flattened —
 * one shape for both the real client and a fake, so `PlaceActor` never sees
 * Google's own nested `LocalizedText`/`priceLevel`-as-enum representation.
 */
export type GooglePlaceDetails = {
  readonly googlePlaceId: string;
  readonly name: string | null;
  readonly formattedAddress: string | null;
  readonly rating: number | null;
  readonly userRatingsTotal: number | null;
  /** Normalised to Google's legacy `0..4`; see `priceLevelToInt`. */
  readonly priceLevel: number | null;
  readonly website: string | null;
  readonly phone: string | null;
  /**
   * `internationalPhoneNumber`, when the mask asked for it (the create-place
   * pre-fill does; enrichment does not and stores `phone` as it always has).
   */
  readonly internationalPhone?: string | null;
  readonly openingHours: Record<string, unknown> | null;
  readonly types: readonly string[];
  readonly businessStatus: string | null;
  readonly editorialSummary: string | null;
  readonly photos: readonly GooglePhotoRef[];
  readonly attributions: readonly Record<string, unknown>[];
};

export type GooglePhotoBytes = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
};

/** One autocomplete prediction or nearby result (C1's `GooglePlacesActor`). */
export type GoogleSuggestion = {
  readonly googlePlaceId: string;
  readonly name: string;
  readonly secondaryText: string | null;
  readonly types: readonly string[];
  readonly location: { readonly lng: number; readonly lat: number } | null;
};

/**
 * The seam. Five operations: the three `enrichFromGoogle` needs (B5) and the
 * two C1's `GooglePlacesActor` needs (§2.3).
 *
 * `autocomplete` and `nearbySearch` were left out of B5 deliberately and are
 * added here rather than in a second interface, so there is one client, one
 * fake per test, and one place a deployment swaps in a service-account
 * implementation.
 */
export type GooglePlacesClient = {
  /** Resolve a place with no known Google id. `null` when Google has no match. */
  textSearch(
    query: string,
    near: { readonly lng: number; readonly lat: number },
  ): Promise<{ readonly googlePlaceId: string } | null>;
  /**
   * `null` when the id is unknown to Google (a stale binding). `fieldMask`
   * defaults to everything enrichment stores; the create-place pre-fill (G21)
   * passes {@link PREFILL_DETAILS_FIELD_MASK}, and fields outside the mask come
   * back null/empty.
   */
  details(
    googlePlaceId: string,
    options?: { readonly fieldMask?: readonly string[] },
  ): Promise<GooglePlaceDetails | null>;
  /** `null` when the photo could not be fetched. */
  photo(
    photoName: string,
    options?: { readonly maxWidthPx?: number; readonly maxHeightPx?: number },
  ): Promise<GooglePhotoBytes | null>;
  /** Type-ahead predictions biased to a point. `null` on any Google failure. */
  autocomplete(
    input: string,
    near: { readonly lng: number; readonly lat: number },
    options?: { readonly radiusMeters?: number },
  ): Promise<readonly GoogleSuggestion[] | null>;
  /** Venues within a radius. `null` on any Google failure. */
  nearbySearch(
    near: { readonly lng: number; readonly lat: number },
    options?: {
      readonly radiusMeters?: number;
      readonly maxResults?: number;
    },
  ): Promise<readonly GoogleSuggestion[] | null>;
};

/* -------------------------------------------------------------------------- */
/* The unconfigured default                                                    */
/* -------------------------------------------------------------------------- */

const unconfigured = (operation: string): never => {
  throw new ConflictError(
    `Google Places is not configured: GOOGLE_PLACES_API_KEY is unset, so ` +
      `PlaceActor cannot ${operation}. Set it to a key with the Places API ` +
      `(New) enabled, or inject a GooglePlacesClient that authenticates some ` +
      `other way (see services/actors/src/lib/google-places.ts). This throws ` +
      `rather than returning an empty result so a misconfigured deployment ` +
      `fails on the first enrichment instead of silently storing nothing.`,
  );
};

export const unconfiguredGooglePlacesClient: GooglePlacesClient = {
  textSearch: async () => unconfigured("resolve a Google place id"),
  details: async () => unconfigured("fetch place details"),
  photo: async () => unconfigured("download a place photo"),
  autocomplete: async () => unconfigured("autocomplete a place name"),
  nearbySearch: async () => unconfigured("search for nearby places"),
};

/* -------------------------------------------------------------------------- */
/* The real client                                                             */
/* -------------------------------------------------------------------------- */

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "types",
  "rating",
  "userRatingCount",
  "priceLevel",
  "websiteUri",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "businessStatus",
  "editorialSummary",
  "photos",
  "attributions",
].join(",");

/**
 * G21's pre-fill: only what `82450ad1`'s create-place form filled in (name,
 * phone, website, editorial summary, types). No photos, hours, rating or
 * address: none of them reach the form, and a mask is what Google bills by.
 */
export const PREFILL_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "types",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "editorialSummary",
] as const;

const TEXT_SEARCH_FIELD_MASK = "places.id";

/**
 * `functions/_utils/google-places/client.ts`'s `VENUE_TYPES`, verbatim: the
 * place types this app cares about (food, drink, retail). Both C1 endpoints
 * restrict to them, so autocomplete does not offer a dentist.
 */
const VENUE_TYPES = [
  "restaurant",
  "bar",
  "wine_bar",
  "pub",
  "cafe",
  "coffee_shop",
  "winery",
  "brewery",
  "brewpub",
  "liquor_store",
];

/** Nearby Search field mask — Pro tier (`displayName` is Pro). */
const NEARBY_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.location",
].join(",");

/**
 * Places API (New) returns `priceLevel` as an enum string. The column is
 * `integer`, holding the legacy `0..4` the rest of the app already renders.
 */
const priceLevelToInt = (value: unknown): number | null => {
  switch (value) {
    case "PRICE_LEVEL_FREE":
      return 0;
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return null;
  }
};

const localized = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null) return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
};

const asRecords = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      )
    : [];

const asStrings = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

const toPhotoRefs = (value: unknown): readonly GooglePhotoRef[] =>
  asRecords(value).flatMap((photo) => {
    const name = asString(photo.name);
    if (name === null) return [];
    const ref: GooglePhotoRef = {
      name,
      ...(asNumber(photo.widthPx) === null
        ? {}
        : { widthPx: asNumber(photo.widthPx) as number }),
      ...(asNumber(photo.heightPx) === null
        ? {}
        : { heightPx: asNumber(photo.heightPx) as number }),
      authorAttributions: asRecords(photo.authorAttributions),
    };
    return [ref];
  });

export const toGooglePlaceDetails = (
  body: Record<string, unknown>,
): GooglePlaceDetails | null => {
  const googlePlaceId = asString(body.id);
  if (googlePlaceId === null) return null;
  const hours = body.regularOpeningHours;
  return {
    googlePlaceId,
    name: localized(body.displayName),
    formattedAddress: asString(body.formattedAddress),
    rating: asNumber(body.rating),
    userRatingsTotal: asNumber(body.userRatingCount),
    priceLevel: priceLevelToInt(body.priceLevel),
    website: asString(body.websiteUri),
    phone: asString(body.nationalPhoneNumber),
    internationalPhone: asString(body.internationalPhoneNumber),
    openingHours:
      typeof hours === "object" && hours !== null
        ? (hours as Record<string, unknown>)
        : null,
    types: asStrings(body.types),
    businessStatus: asString(body.businessStatus),
    editorialSummary: localized(body.editorialSummary),
    photos: toPhotoRefs(body.photos),
    attributions: asRecords(body.attributions),
  };
};

/**
 * The production client. Not exercised by any test in this repo — there are no
 * credentials here — so it is written to be as small as it can be and every
 * response-shaping decision above is a pure function that *is* tested.
 */
export const httpGooglePlacesClient = (apiKey: string): GooglePlacesClient => {
  const headers = (fieldMask?: string): Record<string, string> => ({
    "X-Goog-Api-Key": apiKey,
    ...(fieldMask === undefined ? {} : { "X-Goog-FieldMask": fieldMask }),
  });

  return {
    async textSearch(query, near) {
      const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
        method: "POST",
        headers: {
          ...headers(TEXT_SEARCH_FIELD_MASK),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 1,
          locationBias: {
            circle: {
              center: { latitude: near.lat, longitude: near.lng },
              radius: 500,
            },
          },
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { places?: { id?: string }[] };
      const id = body.places?.[0]?.id;
      return typeof id === "string" ? { googlePlaceId: id } : null;
    },

    async details(googlePlaceId, options) {
      const response = await fetch(
        `${PLACES_API_BASE}/places/${encodeURIComponent(googlePlaceId)}`,
        {
          headers: headers(
            options?.fieldMask === undefined
              ? DETAILS_FIELD_MASK
              : options.fieldMask.join(","),
          ),
        },
      );
      if (!response.ok) return null;
      return toGooglePlaceDetails(
        (await response.json()) as Record<string, unknown>,
      );
    },

    async photo(photoName, options) {
      const width = options?.maxWidthPx ?? 800;
      const height = options?.maxHeightPx ?? 600;
      // `skipHttpRedirect` makes Google answer with JSON naming the CDN URL
      // rather than a 302, which is what the function this replaces relied on.
      const response = await fetch(
        `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${width}` +
          `&maxHeightPx=${height}&skipHttpRedirect=true`,
        { headers: headers() },
      );
      if (!response.ok) return null;
      const { photoUri } = (await response.json()) as { photoUri?: string };
      if (typeof photoUri !== "string") return null;
      const media = await fetch(photoUri);
      if (!media.ok) return null;
      return {
        bytes: new Uint8Array(await media.arrayBuffer()),
        contentType: media.headers.get("content-type") ?? "image/jpeg",
      };
    },

    async autocomplete(input, near, options) {
      const response = await fetch(`${PLACES_API_BASE}/places:autocomplete`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          locationBias: {
            circle: {
              center: { latitude: near.lat, longitude: near.lng },
              radius: options?.radiusMeters ?? 500,
            },
          },
          includedPrimaryTypes: VENUE_TYPES,
          languageCode: "en",
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        suggestions?: {
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            types?: string[];
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }[];
      };
      return (body.suggestions ?? []).flatMap((suggestion) => {
        const prediction = suggestion.placePrediction;
        const googlePlaceId = prediction?.placeId;
        if (typeof googlePlaceId !== "string") return [];
        return [
          {
            googlePlaceId,
            name:
              prediction?.structuredFormat?.mainText?.text ??
              prediction?.text?.text ??
              "Unknown",
            secondaryText:
              prediction?.structuredFormat?.secondaryText?.text ?? null,
            types: prediction?.types ?? [],
            location: null,
          },
        ];
      });
    },

    async nearbySearch(near, options) {
      const response = await fetch(`${PLACES_API_BASE}/places:searchNearby`, {
        method: "POST",
        headers: {
          ...headers(NEARBY_SEARCH_FIELD_MASK),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          includedTypes: VENUE_TYPES,
          locationRestriction: {
            circle: {
              center: { latitude: near.lat, longitude: near.lng },
              radius: options?.radiusMeters ?? 200,
            },
          },
          maxResultCount: options?.maxResults ?? 5,
          languageCode: "en",
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        places?: {
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          types?: string[];
          location?: { latitude?: number; longitude?: number };
        }[];
      };
      return (body.places ?? []).flatMap((place) => {
        if (typeof place.id !== "string") return [];
        const lat = place.location?.latitude;
        const lng = place.location?.longitude;
        return [
          {
            googlePlaceId: place.id,
            name: place.displayName?.text ?? "Unknown",
            secondaryText: place.formattedAddress ?? null,
            types: place.types ?? [],
            location:
              typeof lat === "number" && typeof lng === "number"
                ? { lng, lat }
                : null,
          },
        ];
      });
    },
  };
};

/**
 * What `PlaceActor`'s constructor defaults to: the real client when a key is
 * configured, the loud one when it is not.
 */
export const googlePlacesClient = (): GooglePlacesClient => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  return apiKey === undefined || apiKey === ""
    ? unconfiguredGooglePlacesClient
    : httpGooglePlacesClient(apiKey);
};
