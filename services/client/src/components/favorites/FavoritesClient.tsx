"use client";

import Image from "next/image";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { AppBar } from "@/components/app/AppBar";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { useAppKey } from "@/components/app/overlays/app-keys";
import { DesktopPane } from "@/components/app/overlays/DesktopPane";
import { CellarTile } from "@/components/app/parts/CellarTile";
import { Heart } from "@/components/app/parts/Heart";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { useNavigate } from "@/components/app/useNavigate";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { useFavorite } from "@/components/cellar/list/useFavorite";
import { virtualTotal } from "@/components/cellar/virtualTotal";
import { ApiError } from "@/components/cellar-api/ApiError";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import {
  ItemPane,
  ItemPaneMenu,
  useItemPaneSource,
} from "@/components/item/ItemPane";
import { itemHref } from "@/components/item-api/itemTypes";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { failureFromTransport } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
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
import { LovedSubtitle } from "./LovedSubtitle";
import { type LovedCounts, lovedFilterCounts } from "./loved-counts";

/**
 * One loved drink as the kit's cellar tile (Shell-Me, Loved): photo or
 * plate, name, maker, your stars, and the heart that unloves it in place.
 */
function LovedTile({
  row,
  onBeforeNavigate,
  onOpen,
}: {
  row: FavoriteGridRow;
  onBeforeNavigate?: () => void;
  /** From md: a plain click opens the pane instead of leaving (H-129). */
  onOpen?: (id: string) => void;
}) {
  const { item, type } = row;
  const favourite = useFavorite(item.itemId, type, item.isFavorite ?? true);
  return (
    <CellarTile
      name={
        <Link
          href={itemHref(type, item.id)}
          overlay
          underline="none"
          onPointerDown={() => feedback("press", { phase: "down" })}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            if (
              onOpen === undefined ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.button !== 0
            ) {
              onBeforeNavigate?.();
              return;
            }
            event.preventDefault();
            onOpen(item.id);
          }}
          className="text-ink outline-none"
        >
          {item.name}
        </Link>
      }
      maker={item.subtitle}
      glyph={itemTypeTokens[type].glyph}
      photoUrl={item.displayImageUrl}
      plate={
        <LabelPlate
          type={type}
          plate={item.plate ?? { name: item.name }}
          className="absolute inset-0"
        />
      }
      rating={item.myScore ?? null}
      heart={
        <Heart
          on={favourite.on}
          onToggle={favourite.set}
          label={`Love ${item.name}`}
        />
      }
    />
  );
}

type Selected = { id: string; by: "pointer" | "keyboard" };

/** H-129: the pane for the selected loved drink; it reads the item itself. */
function LovedPane({
  row,
  open,
  onClose,
  onPrevious,
  onNext,
}: {
  row: FavoriteGridRow;
  open: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const navigate = useNavigate();
  const { item, type } = row;
  const source = useItemPaneSource(item.itemId, type);
  return (
    <DesktopPane
      open={open}
      onClose={onClose}
      title={item.name}
      photo={
        item.displayImageUrl ? (
          <Image
            src={item.displayImageUrl}
            alt=""
            fill
            sizes="440px"
            className="object-cover"
          />
        ) : (
          <LabelPlate
            type={type}
            plate={item.plate ?? { name: item.name }}
            className="absolute inset-0"
          />
        )
      }
      onPrevious={onPrevious}
      onNext={onNext}
      onExpand={() => navigate.push(itemHref(type, item.id))}
      more={<ItemPaneMenu source={source} />}
    >
      <ItemPane itemId={item.itemId} itemType={type} source={source} />
    </DesktopPane>
  );
}

/** J and K (or the arrows) move, Enter opens the pane, O the page. */
function LovedKeys({
  onMove,
  onEnter,
  onClear,
  onOpenPage,
}: {
  onMove: (by: 1 | -1) => void;
  onEnter: () => void;
  onClear: () => void;
  onOpenPage: () => void;
}) {
  useAppKey("j", () => onMove(1));
  useAppKey("ArrowRight", () => onMove(1));
  useAppKey("k", () => onMove(-1));
  useAppKey("ArrowLeft", () => onMove(-1));
  useAppKey("Enter", onEnter);
  useAppKey("Backspace", onClear);
  useAppKey("o", onOpenPage);
  return null;
}

interface FavoritesClientProps {
  /** The server's first page, for the filter it was rendered with. */
  initialPage: Page<FavoriteGridRow>;
  initialTypes: ApiItemType[];
  /** F-135: `me.lovedCounts` for the subtitle and chips; null shows none. */
  counts?: LovedCounts | null;
}

/**
 * `82450ad1:src/components/favorites/FavoritesClient.tsx`, restored.
 *
 * Same tree — the title (now an `AppBar`, Back to Me, and "Loved" since
 * D27 renamed favourites at the edges; the data model keeps its name),
 * `CellarItemsFilter` on the old `?types=` URL state, a `VirtualGrid` of
 * kit cellar tiles (Shell-Me), "Nothing loved yet" — over
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
  counts = null,
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

  // H-129: from md a tile selects and opens the pane (no page change).
  const navigate = useNavigate();
  const desktop = useMediaQuery(breakpointUp("md"));
  const [selected, setSelected] = useState<Selected | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const selectedIndex =
    selected === null
      ? -1
      : items.findIndex((row) => row.item.id === selected.id);
  const current = selectedIndex === -1 ? undefined : items[selectedIndex];
  const select = (id: string, by: Selected["by"]) => {
    setSelected({ id, by });
    if (by === "keyboard") {
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-loved-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest" }),
      );
    }
  };
  const move = (by: 1 | -1) => {
    if (items.length === 0) return;
    const next = items[selectedIndex === -1 ? 0 : selectedIndex + by];
    if (next === undefined) return;
    feedback("tick");
    select(next.item.id, "keyboard");
  };

  const grid = (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* Reached from the Me hub (D1): Back goes there on a cold open. */}
      <AppBar title="Loved" parent="/me" />
      <LovedSubtitle counts={counts} />
      {/* X18: Loved holds recipes too (D9); this is the drinks half. Straight
          under the bar, where the recipes half draws it, so the segment does
          not move under the thumb when it switches halves. */}
      <LovedSegment value="drinks" />
      <div className="flex flex-row gap-4">
        <CellarItemsFilter
          types={types}
          counts={lovedFilterCounts(counts)}
          onTypesChange={setTypes}
        />
      </div>
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
          <div
            data-loved-id={x.item.id}
            data-selected={
              desktop && selected?.id === x.item.id ? selected.by : undefined
            }
            className={
              desktop && selected?.id === x.item.id
                ? selected.by === "keyboard"
                  ? "scroll-mt-40 rounded-md outline-2 outline-act-ink outline-offset-2"
                  : "scroll-mt-40 rounded-md outline-2 outline-ring-select outline-offset-2"
                : undefined
            }
          >
            <LovedTile
              row={x}
              onBeforeNavigate={onBeforeNavigate}
              onOpen={
                desktop
                  ? (id) => {
                      feedback("tick");
                      select(id, "pointer");
                      setPaneOpen(true);
                    }
                  : undefined
              }
            />
          </div>
        )}
      />
    </div>
  );

  if (!desktop) return grid;
  return (
    <div className="flex">
      {grid}
      {current !== undefined && (
        <div className="sticky top-0 -my-4 -mr-4 ml-4 h-dvh shrink-0">
          <LovedPane
            row={current}
            open={paneOpen}
            onClose={() => setPaneOpen(false)}
            onPrevious={selectedIndex > 0 ? () => move(-1) : undefined}
            onNext={
              selectedIndex < items.length - 1 ? () => move(1) : undefined
            }
          />
        </div>
      )}
      <LovedKeys
        onMove={move}
        onEnter={() => {
          if (selected !== null) setPaneOpen(true);
        }}
        onClear={() => {
          if (selected === null) return;
          feedback("tick");
          setSelected(null);
          setPaneOpen(false);
        }}
        onOpenPage={() => {
          if (current !== undefined)
            navigate.push(itemHref(current.type, current.item.id));
        }}
      />
    </div>
  );
}
