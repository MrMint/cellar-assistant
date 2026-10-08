"use client";

import { useEffect, useMemo, useState } from "react";
import { failureFromTransport } from "@/lib/api/result";
import { useWholeConnection } from "@/lib/paging/use-whole-connection";
import { placeIdsFromEntries } from "./adapter";
import { onWantToTryChange, withPlaceOverrides } from "./changes";
import { WantToGoPlacesQuery } from "./queries";

const PAGE = 100;

/**
 * The viewer's want-to-go place ids, for the map's pins (X08).
 *
 * The whole list, walked page by page (`useWholeConnection`), so a pin is
 * never silently plain because its place sat past the API's 100-row page.
 * Saves confirmed elsewhere on the screen arrive through `./changes.ts` and
 * apply at once, without a refetch. Empty while loading or on failure: a
 * missing badge is the safe wrong.
 */
export function useWantToGoPlaceIds(): ReadonlySet<string> {
  const list = useWholeConnection({
    query: WantToGoPlacesQuery,
    variables: (after) => ({ first: PAGE, after }),
    select: (data) => {
      const connection = data?.me?.wantToTry;
      if (connection === undefined) {
        return {
          ok: false,
          error: failureFromTransport({ message: "Signed out" }),
        };
      }
      return {
        ok: true,
        data: {
          rows: placeIdsFromEntries(connection.edges),
          endCursor: connection.pageInfo.endCursor ?? null,
          hasNextPage: connection.pageInfo.hasNextPage,
        },
      };
    },
    pageSize: PAGE,
  });

  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  useEffect(
    () =>
      onWantToTryChange((change) => {
        setOverrides((current) =>
          new Map(current).set(change.key, change.saved),
        );
      }),
    [],
  );

  return useMemo(
    () => withPlaceOverrides(list.rows, overrides),
    [list.rows, overrides],
  );
}
