"use client";

/**
 * The old map server actions — `82450ad1:src/app/(authenticated)/map/
 * actions.ts`, `place-actions.ts` and `src/app/actions/menuScanning.ts` — as
 * client functions over URQL with the same names, arguments and result
 * shapes, so the restored components call them unchanged.
 *
 * What changed underneath, and why it is not a route around the server:
 *
 * - No `adminQuery` from Next, no `userId` argument anywhere: every call is
 *   the viewer's own request, and the API decides what they may see.
 * - `createUserPlaceAction`'s rate limit, duplicate re-check and AI review
 *   failed open in the old action (§7). `createPlace` runs all three
 *   server-side and fails closed; this keeps only the old input validation,
 *   which is the message the user saw, and mints the `placeId` so a retried
 *   submit is idempotent (B5).
 * - `google_place_id` on insert is gone (server-owned binding). A form
 *   pre-filled from a Google suggestion binds it afterwards with
 *   `enrichPlaceFromGoogle(placeId, { googlePlaceId })` (G21's sequence).
 * - `uploadAndProcessMenuScan` posted base64 through a server action and
 *   fired `processMenuScan` with the webhook secret. It is now upload →
 *   verify → `createMenuScan` with the place as `placeHint`; processing runs
 *   from the outbox.
 * - `searchMapPlaces` walks `mapBrowse` pages up to the old 500-feature limit
 *   (the rewrite read only the first page of 100).
 *
 * `.toPromise()` here is the imperative half of the map (no-to-promise.test.ts
 * names this file): every read is a one-shot whose staleness is owned by the
 * caller — the map machine runs one fetch at a time and drops a superseded
 * one, the drawer/scan/form effects carry a `cancelled` flag.
 */

import { useMemo } from "react";
import { type Client, useClient } from "urql";
import { uploadFile } from "@/lib/api/files";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import {
  type DuplicatePlace,
  duplicateFrom,
  geocodedLocationFrom,
  looksLikeAddress,
  type MapEntryNode,
  type MenuScanStatusView,
  mapItemsFromBrowse,
  placeResultFromNode,
  scanStatusFrom,
  semanticResultsFrom,
  visitStatusFilterFor,
} from "./adapter";
import { mapItemTypesToCategories } from "./config/scoring";
import {
  CreateMenuScanMutation,
  CreatePlaceMutation,
  DuplicatePlacesQuery,
  EnrichPlaceMutation,
  GeocodeQuery,
  GooglePlaceSuggestionsQuery,
  MAP_FEATURE_LIMIT,
  MAP_PAGE_SIZE,
  MapBrowseQuery,
  MenuScanStatusQuery,
  PlaceByIdQuery,
  PlaceSearchQuery,
  ReverseGeocodeQuery,
  SEMANTIC_RESULT_LIMIT,
} from "./queries";
import type { MapSearchParams, MapSearchResults, PlaceResult } from "./types";

// ---------------------------------------------------------------------------
// Map search (the old `map/actions.ts`)
// ---------------------------------------------------------------------------

/**
 * The old unified `searchMapPlaces`: geocode an address-shaped query, else
 * search by meaning, else browse the viewport. Throws on a failure so the
 * machine's `onError` shows it, as the server action's throw did.
 */
export async function searchMapPlaces(
  client: Client,
  params: MapSearchParams,
): Promise<MapSearchResults> {
  const {
    bounds,
    itemTypes = [],
    minRating,
    visitStatuses = [],
    tierListIds,
    semanticQuery,
    globalSearch = true,
  } = params;
  const trimmedQuery = semanticQuery?.trim();
  const categories = mapItemTypesToCategories(itemTypes) ?? null;
  const tiers = tierListIds && tierListIds.length > 0 ? tierListIds : null;

  if (trimmedQuery && looksLikeAddress(trimmedQuery)) {
    const geocode = await client
      .query(
        GeocodeQuery,
        { query: trimmedQuery },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    // A geocoder failure falls through to the meaning search, as before.
    const geocodeResult = geocodedLocationFrom(geocode.data?.geocode);
    if (geocodeResult) {
      return {
        places: [],
        mapItems: [],
        isSemanticSearch: false,
        geocodeResult,
        searchMetadata: { itemTypes, totalResults: 0, hasMore: false },
      };
    }
  }

  if (trimmedQuery && trimmedQuery.length > 0) {
    const response = await client
      .query(
        PlaceSearchQuery,
        {
          query: trimmedQuery,
          bounds: globalSearch ? null : bounds,
          filterCategories: categories,
          minRating: minRating ?? null,
          tierListIds: tiers,
          first: SEMANTIC_RESULT_LIMIT,
        },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (response.error) {
      throw new Error(failureFromTransport(response.error).message);
    }
    const result = unwrapResult(
      response.data?.placeSearch,
      "PlaceSearchConnection",
    );
    if (!result.ok) throw new Error(result.error.message);
    const semanticResults = semanticResultsFrom(
      result.data.edges.map((edge) => edge.node),
      { bounds, itemTypes, minRating, semanticQuery: trimmedQuery },
    );
    return {
      places: semanticResults,
      mapItems: semanticResults,
      semanticResults,
      isSemanticSearch: true,
      searchMetadata: {
        itemTypes,
        totalResults: result.data.totalCount ?? semanticResults.length,
        hasMore: false,
      },
    };
  }

  const nodes: MapEntryNode[] = [];
  let after: string | null = null;
  for (;;) {
    const page: BrowsePage = await browsePage(client, {
      bounds,
      categories,
      minRating: minRating ?? null,
      tierListIds: tiers,
      visitStatus: visitStatusFilterFor(visitStatuses),
      after,
    });
    nodes.push(...page.nodes);
    after = page.endCursor;
    if (after === null || nodes.length >= MAP_FEATURE_LIMIT) break;
  }

  const mapItems = mapItemsFromBrowse(nodes, {
    bounds,
    itemTypes,
    minRating,
    visitStatuses,
  });
  const places = mapItems.filter(
    (item): item is PlaceResult => !("is_cluster" in item),
  );
  return {
    places,
    mapItems,
    isSemanticSearch: false,
    searchMetadata: {
      itemTypes,
      totalResults: mapItems.length,
      hasMore: mapItems.length >= MAP_FEATURE_LIMIT,
    },
  };
}

type BrowsePage = { nodes: MapEntryNode[]; endCursor: string | null };

/** One `mapBrowse` page; `endCursor` is null when there is no next page. */
async function browsePage(
  client: Client,
  variables: {
    bounds: MapSearchParams["bounds"];
    categories: string[] | null;
    minRating: number | null;
    tierListIds: string[] | null;
    visitStatus: "VISITED" | "UNVISITED" | null;
    after: string | null;
  },
): Promise<BrowsePage> {
  const response = await client
    .query(
      MapBrowseQuery,
      { ...variables, limit: MAP_FEATURE_LIMIT, first: MAP_PAGE_SIZE },
      { requestPolicy: "network-only" },
    )
    .toPromise();
  if (response.error) {
    throw new Error(failureFromTransport(response.error).message);
  }
  const result = unwrapResult(response.data?.mapBrowse, "MapEntryConnection");
  if (!result.ok) throw new Error(result.error.message);
  return {
    nodes: result.data.edges.map((edge) => edge.node),
    endCursor: result.data.pageInfo.hasNextPage
      ? (result.data.pageInfo.endCursor ?? null)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Place actions (the old `place-actions.ts`)
// ---------------------------------------------------------------------------

export interface CreatePlaceInput {
  name: string;
  categories: string[];
  latitude: number;
  longitude: number;
  street_address?: string;
  locality?: string;
  region?: string;
  postcode?: string;
  country_code?: string;
  phone?: string;
  website?: string;
  description?: string;
  /** Bound after creation through enrichment; never posted with the place. */
  google_place_id?: string;
}

export interface GoogleNearbyPlace {
  googlePlaceId: string;
  name: string;
  address: string;
  types: string[];
  location: { latitude: number; longitude: number };
}

export interface GoogleAutocompleteSuggestion {
  googlePlaceId: string;
  name: string;
  secondaryText: string;
  types: string[];
}

export interface CreatePlaceResult {
  success: boolean;
  placeId?: string;
  error?: string;
  duplicates?: DuplicatePlace[];
}

export type EnrichPlaceResult = {
  success: boolean;
  status: string | null;
  reason?: string;
};

export type { DuplicatePlace, MenuScanStatusView as MenuScanStatus };

const WEBSITE_PROTOCOL_RE = /^https?:\/\//i;

/** The old server-side `normalizeWebsite`. */
export function normalizeWebsite(value?: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const candidate = WEBSITE_PROTOCOL_RE.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname.includes(".")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * The old `createUserPlaceAction` step 0, verbatim in its messages. Returns
 * the error to show, or null. Phone validity is the form's
 * (`isValidPhoneNumber`); the server trims it (G38).
 */
export function validateCreatePlaceInput(
  input: CreatePlaceInput,
): string | null {
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 200) {
    return "Place name must be between 2 and 200 characters.";
  }
  if (input.description && input.description.length > 1000) {
    return "Description must be under 1000 characters.";
  }
  if (input.categories.length === 0) {
    return "At least one category is required.";
  }
  const countryCode = input.country_code?.trim() ?? "";
  if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) {
    return "Country code must be a valid 2-letter code.";
  }
  if (input.website?.trim() && !normalizeWebsite(input.website)) {
    return "Enter a valid website URL.";
  }
  return null;
}

const blankToNull = (value?: string): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

export function usePlaceActions() {
  const client = useClient();

  return useMemo(() => {
    const reverseGeocodeAction = async (
      latitude: number,
      longitude: number,
    ) => {
      const response = await client
        .query(ReverseGeocodeQuery, {
          location: { lat: latitude, lng: longitude },
        })
        .toPromise();
      const result = response.data?.reverseGeocode;
      if (!result) return null;
      return {
        street_address: result.streetAddress ?? undefined,
        locality: result.locality ?? undefined,
        region: result.region ?? undefined,
        postcode: result.postcode ?? undefined,
        country_code: result.countryCode ?? undefined,
      };
    };

    const checkDuplicatePlacesAction = async (
      name: string,
      latitude: number,
      longitude: number,
    ): Promise<{ duplicates: DuplicatePlace[] }> => {
      const trimmed = name.trim();
      if (trimmed.length < 2) return { duplicates: [] };
      const response = await client
        .query(
          DuplicatePlacesQuery,
          {
            name: trimmed,
            location: { lat: latitude, lng: longitude },
            radiusMeters: 200,
            minSimilarity: 0.3,
            limit: 5,
          },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      const result = unwrapResult(
        response.data?.duplicatePlaces,
        "DuplicatePlaceConnection",
      );
      return {
        duplicates: result.ok
          ? result.data.edges.map((edge) => duplicateFrom(edge.node))
          : [],
      };
    };

    const fetchPlaceByIdAction = async (
      placeId: string,
    ): Promise<PlaceResult | null> => {
      const response = await client
        .query(PlaceByIdQuery, { id: placeId })
        .toPromise();
      const result = unwrapResult(response.data?.place, "Place");
      return result.ok ? placeResultFromNode(result.data) : null;
    };

    const googleSuggestions = async (
      mode: "NEARBY" | "AUTOCOMPLETE",
      latitude: number,
      longitude: number,
      input: string | null,
    ) => {
      const response = await client
        .query(GooglePlaceSuggestionsQuery, {
          input,
          location: { lat: latitude, lng: longitude },
          mode,
        })
        .toPromise();
      const field = response.data?.googlePlaceSuggestions;
      return {
        nodes: field?.suggestions.edges.map((edge) => edge.node) ?? [],
        // Uncharged with a reason = the budget said no (fails closed).
        budgetExhausted:
          field != null && !field.charged && field.reason != null,
      };
    };

    const googleNearbySearchAction = async (
      latitude: number,
      longitude: number,
    ): Promise<{ places: GoogleNearbyPlace[]; budgetExhausted: boolean }> => {
      const { nodes, budgetExhausted } = await googleSuggestions(
        "NEARBY",
        latitude,
        longitude,
        null,
      );
      return {
        places: nodes.map((node) => ({
          googlePlaceId: node.googlePlaceId,
          name: node.name,
          address: node.secondaryText ?? "",
          types: [...node.types],
          location: {
            latitude: node.location?.lat ?? latitude,
            longitude: node.location?.lng ?? longitude,
          },
        })),
        budgetExhausted,
      };
    };

    const googleAutocompleteAction = async (
      input: string,
      latitude: number,
      longitude: number,
    ): Promise<{
      suggestions: GoogleAutocompleteSuggestion[];
      budgetExhausted: boolean;
    }> => {
      const { nodes, budgetExhausted } = await googleSuggestions(
        "AUTOCOMPLETE",
        latitude,
        longitude,
        input,
      );
      return {
        suggestions: nodes.map((node) => ({
          googlePlaceId: node.googlePlaceId,
          name: node.name,
          secondaryText: node.secondaryText ?? "",
          types: [...node.types],
        })),
        budgetExhausted,
      };
    };

    const enrichPlaceAction = async (params: {
      placeId: string;
      googlePlaceId?: string;
      resolvedVia?: "autocomplete" | "nearby_search";
    }): Promise<EnrichPlaceResult> => {
      const response = await client
        .mutation(EnrichPlaceMutation, {
          placeId: params.placeId,
          input:
            params.googlePlaceId === undefined
              ? null
              : {
                  googlePlaceId: params.googlePlaceId,
                  resolvedVia: params.resolvedVia ?? null,
                },
        })
        .toPromise();
      if (response.error) {
        return {
          success: false,
          status: null,
          reason: failureFromTransport(response.error).message,
        };
      }
      const result = unwrapResult(
        response.data?.enrichPlaceFromGoogle,
        "EnrichPlacePayload",
      );
      if (!result.ok) {
        return { success: false, status: null, reason: result.error.message };
      }
      return {
        success: result.data.collision === null,
        status: result.data.status,
        reason:
          result.data.collision === null
            ? undefined
            : "Google already links that listing to another place.",
      };
    };

    const createUserPlaceAction = async (
      input: CreatePlaceInput,
    ): Promise<CreatePlaceResult> => {
      const invalid = validateCreatePlaceInput(input);
      if (invalid) return { success: false, error: invalid };

      const placeId = crypto.randomUUID();
      const response = await client
        .mutation(CreatePlaceMutation, {
          input: {
            placeId,
            name: input.name.trim(),
            categories: input.categories,
            location: { lat: input.latitude, lng: input.longitude },
            streetAddress: blankToNull(input.street_address),
            locality: blankToNull(input.locality),
            region: blankToNull(input.region),
            postcode: blankToNull(input.postcode),
            countryCode: blankToNull(input.country_code)?.toUpperCase() ?? null,
            phone: blankToNull(input.phone),
            website: normalizeWebsite(input.website),
            description: blankToNull(input.description),
          },
        })
        .toPromise();
      if (response.error) {
        return {
          success: false,
          error: failureFromTransport(response.error).message,
        };
      }
      const result = unwrapResult(
        response.data?.createPlace,
        "CreatePlacePayload",
      );
      if (!result.ok) return { success: false, error: result.error.message };

      if (input.google_place_id) {
        // G21: bind the suggestion the form was filled from. Best effort,
        // as the old prefill was: the place exists either way.
        await enrichPlaceAction({
          placeId: result.data.place.id,
          googlePlaceId: input.google_place_id,
        }).catch(() => undefined);
      }
      return { success: true, placeId: result.data.place.id };
    };

    // -- menu scanning (the old `menuScanning.ts`) --------------------------

    const uploadAndProcessMenuScan = async (
      file: File,
      placeId: string,
    ): Promise<{ success: boolean; scanId?: string; error?: string }> => {
      try {
        const fileId = await uploadFile(client, file, "menu-scan", {
          verify: true,
        });
        const response = await client
          .mutation(CreateMenuScanMutation, {
            menuScanId: crypto.randomUUID(),
            input: { originalImageId: fileId, placeHint: { placeId } },
          })
          .toPromise();
        if (response.error) {
          return {
            success: false,
            error: failureFromTransport(response.error).message,
          };
        }
        const result = unwrapResult(response.data?.createMenuScan, "MenuScan");
        if (!result.ok) return { success: false, error: result.error.message };
        return { success: true, scanId: result.data.id };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    };

    const getMenuScanStatus = async (
      scanId: string,
    ): Promise<MenuScanStatusView | null> => {
      const response = await client
        .query(
          MenuScanStatusQuery,
          { id: scanId },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      const result = unwrapResult(response.data?.menuScan, "MenuScan");
      return result.ok ? scanStatusFrom(result.data) : null;
    };

    return {
      reverseGeocodeAction,
      checkDuplicatePlacesAction,
      fetchPlaceByIdAction,
      googleNearbySearchAction,
      googleAutocompleteAction,
      enrichPlaceAction,
      createUserPlaceAction,
      uploadAndProcessMenuScan,
      getMenuScanStatus,
    };
  }, [client]);
}
