"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "urql";
import {
  type ApiFailure,
  failureFromTransport,
  unwrapResult,
} from "@/lib/api/result";
import {
  enrichmentFrom,
  interactionFrom,
  menuItemFrom,
  photosFrom,
  tierListEntriesFrom,
} from "../adapter";
import {
  MENU_ITEMS_PAGE_SIZE,
  PLACE_PHOTOS_PAGE_SIZE,
  PLACE_TIER_LIST_ENTRIES_PAGE_SIZE,
  PlaceDetailsQuery,
  RecordPlaceAccessMutation,
  RecordPlaceInteractionMutation,
} from "../queries";
import { usePlaceEnrichment } from "./usePlaceEnrichment";

/**
 * The old drawer's and place page's shared read: `GET_PLACE_DETAILS`
 * (place + the viewer's interaction + the current menu) and the lazy Google
 * enrichment, as one hook over `PlaceDetailsQuery`, adapted to the old
 * snake_case shapes the restored components render.
 *
 * Also fires `recordPlaceAccess` once per place (kept from D5: telemetry for
 * `PlaceRefreshJobActor`, never awaited by the render).
 */

/** The old `PlaceDetails` fragment, flattened. */
export type PlaceDetailsData = {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  primary_category: string | null;
  categories: string[];
  confidence: number | null;
  location: { coordinates: [number, number] };
  street_address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country_code: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  is_verified: boolean;
  hours: unknown;
  price_level: number | null;
  rating: number | null;
  review_count: number | null;
};

export function usePlaceDetails(placeId: string | undefined) {
  const [{ data, fetching, error }, reexecute] = useQuery({
    query: PlaceDetailsQuery,
    variables: {
      id: placeId ?? "",
      menuItems: MENU_ITEMS_PAGE_SIZE,
      photos: PLACE_PHOTOS_PAGE_SIZE,
      tierListEntries: PLACE_TIER_LIST_ENTRIES_PAGE_SIZE,
    },
    pause: !placeId,
  });
  const [, recordAccess] = useMutation(RecordPlaceAccessMutation);
  const [, recordInteraction] = useMutation(RecordPlaceInteractionMutation);

  useEffect(() => {
    if (placeId) void recordAccess({ placeId });
  }, [placeId, recordAccess]);

  const refetch = useCallback(
    () => reexecute({ requestPolicy: "network-only" }),
    [reexecute],
  );

  const result = useMemo(() => unwrapResult(data?.place, "Place"), [data]);
  const raw = result.ok ? result.data : null;
  const failure: ApiFailure | null = error
    ? failureFromTransport(error)
    : !fetching && data !== undefined && !result.ok
      ? result.error
      : null;

  const adapted = useMemo(() => {
    if (!raw) return null;
    const place: PlaceDetailsData = {
      id: raw.id,
      name: raw.name,
      display_name: raw.displayName ?? null,
      description: raw.description ?? null,
      primary_category: raw.primaryCategory ?? null,
      categories: [...raw.categories],
      confidence: raw.confidence ?? null,
      location: { coordinates: [raw.location.lng, raw.location.lat] },
      street_address: raw.streetAddress ?? null,
      locality: raw.locality ?? null,
      region: raw.region ?? null,
      postcode: raw.postcode ?? null,
      country_code: raw.countryCode ?? null,
      phone: raw.phone ?? null,
      website: raw.website ?? null,
      email: raw.email ?? null,
      is_verified: raw.isVerified,
      hours: raw.hours ?? null,
      price_level: raw.priceLevel ?? null,
      rating: raw.rating ?? null,
      review_count: raw.reviewCount ?? null,
    };
    return {
      place,
      userInteraction: interactionFrom(raw.myInteraction),
      menuItems: raw.menuItems.edges.map((edge) => menuItemFrom(edge.node)),
      menuItemCount: raw.menuItems.totalCount,
      enrichment: enrichmentFrom(raw.enrichment),
      googlePhotos: photosFrom(raw.photos.edges.map((edge) => edge.node)),
      tierListEntries: tierListEntriesFrom(
        raw.tierListEntries.edges.map((edge) => edge.node),
      ),
    };
  }, [raw]);

  const { isEnriching } = usePlaceEnrichment({
    placeId,
    loaded: raw !== null,
    hasEnrichment: raw?.enrichment != null,
    refetch,
  });

  /** Save/unsave and visit/unvisit; resolves to an error message or null. */
  const setInteraction = useCallback(
    async (patch: {
      isFavorite?: boolean;
      isVisited?: boolean;
    }): Promise<string | null> => {
      if (!placeId) return "No place";
      const response = await recordInteraction({
        input: { placeId, ...patch },
      });
      if (response.error) return failureFromTransport(response.error).message;
      const written = unwrapResult(
        response.data?.recordPlaceInteraction,
        "PlaceInteraction",
      );
      if (!written.ok) return written.error.message;
      refetch();
      return null;
    },
    [placeId, recordInteraction, refetch],
  );

  return {
    ...(adapted ?? {
      place: null,
      userInteraction: undefined,
      menuItems: [],
      menuItemCount: 0,
      enrichment: null,
      googlePhotos: [],
      tierListEntries: [],
    }),
    fetching: fetching && raw === null,
    failure,
    isEnriching,
    refetch,
    setInteraction,
  };
}
