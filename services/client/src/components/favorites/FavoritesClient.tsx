"use client";

import { useEffect, useMemo } from "react";
import { AppBar } from "@/components/app/AppBar";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { virtualTotal } from "@/components/cellar/virtualTotal";
import { ApiError } from "@/components/cellar-api/ApiError";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard } from "@/components/item/ItemCard";
import { itemHref } from "@/components/item-api/itemTypes";
import { failureFromTransport } from "@/lib/api/result";
import { type Page, toPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { useTypesFilterState } from "@/utilities/hooks";
import {
  type FavoriteGridRow,
  favoriteRowFromNode,
  favoritesCacheKey,
  favoritesVariables,
} from "./adapter";
import { FavoritesQuery } from "./fragments";
import { LovedSegment } from "./LovedSegment";

interface FavoritesClientProps {
  /** The server's first page, for the filter it was rendered with. */
  initialPage: Page<FavoriteGridRow>;
  initialTypes: ApiItemType[];
}

/**
 * `82450ad1:src/components/favorites/FavoritesClient.tsx`, restored.
 *
 * Same tree — the title (now an `AppBar`, Back to Me, and "Loved" since
 * D27 renamed favourites at the edges; the data model keeps its name), `CellarItemsFilter` on the old `?types=` URL
 * state, `VirtualGrid` of `ItemCard`s, "No favorites found" — over
 * `me.favorites(types:)`:
 *
 * - The first page is the server's (the old page fetched one and discarded
 *   it); `VirtualGrid`'s eager load-more walks the connection's cursor.
 * - A type change re-reads page one with `types:` (G25), so the filter is
 *   server-side and paging stays honest.
 * - Sake and tea favourites show; card links are absolute (§7).
 * - `me === null` (a session that ended between the layout's check and this
 *   read) is a failure message, not an empty grid.
 */
export function FavoritesClient({
  initialPage,
  initialTypes,
}: FavoritesClientProps) {
  const { types, setTypes } = useTypesFilterState();

  const list = usePagedConnection({
    query: FavoritesQuery,
    variables: (args: string, after) =>
      favoritesVariables(
        args === "" ? [] : (args.split(",") as ApiItemType[]),
        after,
      ),
    select: (data) => {
      const connection = data?.me?.favorites;
      return connection === undefined
        ? {
            ok: false,
            error: failureFromTransport({
              message: "Your session has ended. Sign in again to see more.",
            }),
          }
        : {
            ok: true,
            data: toPage(connection, (edge) => favoriteRowFromNode(edge.node)),
          };
    },
    initial: initialPage,
    initialArgs: initialTypes.join(","),
  });

  // The URL is the filter's source of truth; follow it.
  const key = (types ?? []).join(",");
  const { reset, args } = list;
  useEffect(() => {
    if (key !== args) void reset(key);
  }, [key, args, reset]);

  const items = useMemo(() => [...list.rows], [list.rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Reached from the Me hub (D1): Back goes there on a cold open. */}
        <AppBar title="Loved" parent="/me" className="min-w-0 flex-1" />
        <div className="flex flex-row gap-4">
          <CellarItemsFilter types={types} onTypesChange={setTypes} />
        </div>
      </div>
      {/* X18: Loved holds recipes too (D9); this is the drinks half. */}
      <LovedSegment value="drinks" />
      {list.failure !== null && <ApiError error={list.failure} title="Loved" />}
      <VirtualGrid
        items={items}
        totalCount={virtualTotal(list)}
        cacheKey={favoritesCacheKey(types)}
        getItemKey={(x) => x.item.id}
        gridBreakpoints={{ xs: 6, md: 4, lg: 2 }}
        emptyMessage={
          list.status === "resetting"
            ? "Loading what you love…"
            : "Nothing loved yet. Tap the heart on anything you love."
        }
        onLoadMore={async () => {
          await list.loadMore();
        }}
        isLoadingMore={list.status === "loadingMore"}
        renderItem={(x, onBeforeNavigate) => (
          <ItemCard
            item={x.item}
            type={x.type}
            href={itemHref(x.type, x.item.id)}
            onClick={onBeforeNavigate}
          />
        )}
      />
    </div>
  );
}
