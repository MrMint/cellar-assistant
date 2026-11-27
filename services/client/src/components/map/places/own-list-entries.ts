"use client";

/**
 * CC-3: "Your rank" and "On your lists" are the viewer's own lists.
 * `Place.tierListEntries` is every list the viewer may see (`canSeeTierList`:
 * a friend's, a public one), so the page reads who made each list
 * (`TierList.createdById`) and who is looking (`me.id`), and keeps only the
 * viewer's. `PlaceDetailsQuery` (P1's) does not select the owner yet; this
 * read asks for just that, and folds away once it does (hand-off).
 */

import { useMemo } from "react";
import { useQuery } from "urql";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import { PLACE_TIER_LIST_ENTRIES_PAGE_SIZE } from "../queries";
import type { PlaceListEntry } from "./PlaceSections";

export const PlaceListOwnersQuery = graphql(
  `
  query PlaceListOwners($id: ID!, $tierListEntries: Int!) {
    me {
      id
    }
    place(id: $id) {
      __typename
      ... on Place {
        id
        tierListEntries(first: $tierListEntries) {
          edges {
            node {
              __typename
              id
              tierList {
                __typename
                id
                createdById
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The entries on lists `viewerId` made, in their order. Unknown (the viewer
 * or a list's owner not read yet) shows nothing rather than someone else's
 * list as the viewer's.
 */
export function ownListEntries<T extends PlaceListEntry>(
  entries: readonly T[],
  owners: ReadonlyMap<string, string>,
  viewerId: string | null,
): T[] {
  if (viewerId === null) return [];
  return entries.filter(
    (entry) =>
      entry.tier_list !== null && owners.get(entry.tier_list.id) === viewerId,
  );
}

export function useOwnListEntries<T extends PlaceListEntry>(
  placeId: string,
  entries: readonly T[],
): T[] {
  const [{ data }] = useQuery({
    query: PlaceListOwnersQuery,
    variables: {
      id: placeId,
      tierListEntries: PLACE_TIER_LIST_ENTRIES_PAGE_SIZE,
    },
    pause: placeId === "",
  });
  const viewerId = data?.me?.id ?? null;
  const place = data?.place?.__typename === "Place" ? data.place : null;
  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of place?.tierListEntries.edges ?? []) {
      const list = edge.node.tierList;
      if (list) map.set(list.id, list.createdById);
    }
    return map;
  }, [place]);
  return useMemo(
    () => ownListEntries(entries, owners, viewerId),
    [entries, owners, viewerId],
  );
}
