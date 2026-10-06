"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "urql";
import {
  type ApiFailure,
  failureFromTransport,
  unwrapResult,
} from "@/lib/api/result";
import { type Page, toPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import {
  enrichmentFrom,
  interactionFrom,
  type MenuItemView,
  menuItemFrom,
  photosFrom,
  tierListEntriesFrom,
} from "../adapter";
import {
  MENU_ITEMS_PAGE_SIZE,
  PLACE_PHOTOS_PAGE_SIZE,
  PLACE_TIER_LIST_ENTRIES_PAGE_SIZE,
  PlaceDetailsQuery,
  PlaceMenuItemsPageQuery,
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
 *
 * The menu: the old `place_menu_items` read was unbounded, and
 * `Place.menuItems` pages at 100. The first page rides on the place query;
 * `loadMoreMenuItems` walks the rest through `PlaceMenuItemsPageQuery`, and
 * `menuItemCount` is the connection's `totalCount`, so the tab badge says how
 * many lines the place has, not how many are loaded. A re-read of the place
 * (a save, the enrichment poll) keeps the pages already loaded past the
 * first rather than collapsing the list under the viewer.
 */

const EMPTY_MENU_PAGE: Page<MenuItemView> = {
  rows: [],
  endCursor: null,
  hasNextPage: false,
};

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

  const menu = usePagedConnection({
    query: PlaceMenuItemsPageQuery,
    variables: (id: string, after) => ({
      id,
      first: MENU_ITEMS_PAGE_SIZE,
      after,
    }),
    select: (answer) => {
      const place = unwrapResult(answer?.place, "Place");
      if (!place.ok) return place;
      return {
        ok: true,
        data: toPage(place.data.menuItems, (edge) => menuItemFrom(edge.node)),
      };
    },
    initial: EMPTY_MENU_PAGE,
    initialArgs: "",
  });
  const firstMenuPage = useMemo(
    () =>
      raw
        ? toPage(raw.menuItems, (edge) => menuItemFrom(edge.node))
        : EMPTY_MENU_PAGE,
    [raw],
  );
  const { replace: replaceMenu } = menu;
  const menuHeld = useRef({ args: menu.args, loaded: menu.rows.length });
  menuHeld.current = { args: menu.args, loaded: menu.rows.length };
  useEffect(() => {
    if (!raw) return;
    const held = menuHeld.current;
    // Same place, and the viewer has paged past what the re-read returned.
    if (held.args === raw.id && held.loaded > firstMenuPage.rows.length) {
      return;
    }
    replaceMenu(firstMenuPage, raw.id);
  }, [raw, firstMenuPage, replaceMenu]);
  // Until the effect adopts a new place's first page, show that page.
  const menuIsCurrent = raw !== null && menu.args === raw.id;
  const menuRows = menuIsCurrent ? menu.rows : firstMenuPage.rows;
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
      menuItems: [...menuRows],
      menuItemCount:
        (menuIsCurrent ? menu.totalCount : null) ??
        raw.menuItems.totalCount ??
        menuRows.length,
      enrichment: enrichmentFrom(raw.enrichment),
      googlePhotos: photosFrom(raw.photos.edges.map((edge) => edge.node)),
      tierListEntries: tierListEntriesFrom(
        raw.tierListEntries.edges.map((edge) => edge.node),
      ),
    };
  }, [raw, menuRows, menuIsCurrent, menu.totalCount]);

  const { isEnriching } = usePlaceEnrichment({
    placeId,
    loaded: raw !== null,
    hasEnrichment: raw?.enrichment != null,
    photosPending:
      raw?.enrichment != null && raw.enrichment.photosFetchedAt == null,
    refetch,
  });

  const { loadMore: loadMoreMenu } = menu;
  const loadMoreMenuItems = useCallback(() => {
    void loadMoreMenu();
  }, [loadMoreMenu]);

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
    hasMoreMenuItems: menuIsCurrent
      ? menu.hasNextPage
      : firstMenuPage.hasNextPage,
    loadingMoreMenuItems: menu.status === "loadingMore",
    menuLoadMoreError: menuIsCurrent ? (menu.failure?.message ?? null) : null,
    loadMoreMenuItems,
    fetching: fetching && raw === null,
    failure,
    isEnriching,
    refetch,
    setInteraction,
  };
}
