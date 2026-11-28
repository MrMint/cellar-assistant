"use client";

import { useMemo } from "react";
import { useQuery } from "urql";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import { type MapEntryNode, mapItemsFromBrowse } from "../adapter";
import {
  listChip,
  type OwnPoint,
  pointsFrom,
  WORLD_BOUNDS,
} from "../core/own-places";
import { MAP_FEATURE_LIMIT, MAP_PAGE_SIZE, MapBrowseQuery } from "../queries";

/** F-191: the name and owner of the list a `/map?list=` link opened. */
export const MapListChipQuery = graphql(
  `
  query MapListChip($id: ID!) {
    me {
      id
    }
    tierList(id: $id) {
      __typename
      ... on TierList {
        id
        name
        createdById
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The places on `tierListIds`, wherever they are (F-33, F-34, F-191): one
 * whole-world `mapBrowse` filtered to those lists, as points. Empty while
 * there are no lists to read.
 */
export function useOwnPlaces(tierListIds: readonly string[]): {
  points: OwnPoint[];
  loaded: boolean;
} {
  const [{ data, fetching }] = useQuery({
    query: MapBrowseQuery,
    variables: {
      bounds: WORLD_BOUNDS,
      tierListIds: [...tierListIds],
      limit: MAP_FEATURE_LIMIT,
      first: MAP_PAGE_SIZE,
    },
    pause: tierListIds.length === 0,
  });
  const browse = data?.mapBrowse;
  const points = useMemo(() => {
    if (browse?.__typename !== "MapEntryConnection") return [];
    const nodes = browse.edges.map((edge) => edge.node as MapEntryNode);
    return pointsFrom(mapItemsFromBrowse(nodes, { bounds: WORLD_BOUNDS }));
  }, [browse]);
  return {
    points,
    loaded: tierListIds.length > 0 && !fetching && data !== undefined,
  };
}

/** The chip for a `/map?list=<id>` link: the list's name, and if it's yours. */
export function useListChip(listId: string | null) {
  const [{ data }] = useQuery({
    query: MapListChipQuery,
    variables: { id: listId ?? "" },
    pause: listId === null,
  });
  const list = data?.tierList?.__typename === "TierList" ? data.tierList : null;
  return listChip({ listId, list, viewerId: data?.me?.id ?? null });
}
