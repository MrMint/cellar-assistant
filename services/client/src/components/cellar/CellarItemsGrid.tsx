"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Spinner } from "@/components/ui/spinner";
import { useColumnCount } from "@/hooks/useColumnCount";
import { useNow } from "@/hooks/useNow";
import { unwrapResult } from "@/lib/api/result";
import { toPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import {
  type CellarGridItem,
  cellarBottleHref,
  cellarGroupCell,
} from "./adapter";
import { BottleCard } from "./BottleCard";
import { CellarItemsEmpty } from "./CellarItemsEmpty";
import {
  CellarItemSkeletonCard,
  cellarItemsGridClass,
} from "./CellarItemsGridSkeleton";
import {
  type CellarItemsArgs,
  cellarItemsCacheKey,
  cellarItemsVariables,
} from "./cellarItemsQuery";
import { GetCellarItemGroupsQuery } from "./fragments";
import { virtualTotal } from "./virtualTotal";

const SCROLL_STORAGE_KEY = "scroll-restore";
/** A 171 px BottleCard on a 390 phone: a 3:4 plate, title, state, level. */
const ESTIMATED_ROW_HEIGHT = 330;

type TransformedCellarItem = CellarGridItem;

// Module-level cache — survives unmount/remount within the same SPA session.
// On back-navigation the component initializes from this cache (all previously
// loaded items + row height measurements) so scroll restore is pixel-perfect.
// It now holds the connection's state (rows, cursor, hasNextPage) rather than
// an offset total.
const gridItemsCache = new Map<
  string,
  {
    items: readonly TransformedCellarItem[];
    endCursor: string | null;
    hasNextPage: boolean;
    totalCount: number | null;
    measurements: Record<number, number>;
  }
>();

interface CellarItemsGridProps {
  initialItems: TransformedCellarItem[];
  /** The server page's `pageInfo` and count — the grid pages on from here. */
  initialCursor: string | null;
  initialHasNextPage: boolean;
  totalCount: number | null;
  cellarId: string;
  search: string;
  types: CellarItemsArgs["types"];
  sort?: CellarItemsArgs["sort"];
  status?: CellarItemsArgs["status"];
  /** The server's request time: the first render's "now" (`useNow`). */
  asOf: number | null;
  /** Creator or co-owner: the empty cellar's one action is "Snap a bottle". */
  canAdd: boolean;
}

/**
 * `82450ad1:src/components/cellar/CellarItemsGrid.tsx`, restored.
 *
 * X04: the cells are `Cellar.itemGroups` — identical bottles as one card with
 * a ×N — and a search narrows the list rather than re-sorting it.
 *
 * The virtualizer, eager load-more, module cache, sessionStorage scroll
 * restore, skeleton rows and responsive columns are the old ones. The data
 * half changed: `loadMoreCellarItemsAction` sliced a server-side
 * `unstable_cache` of the whole cellar (keyed across auth tokens, §7); this
 * pages `Cellar.items` with Relay cursors through `usePagedConnection`, with
 * variables from `cellarItemsVariables` — the same function the server page
 * used for the first page. Card hrefs are absolute (`cellarBottleHref`).
 */
export function CellarItemsGrid({
  initialItems,
  initialCursor,
  initialHasNextPage,
  totalCount,
  cellarId,
  search,
  types,
  sort,
  status,
  asOf,
  canAdd,
}: CellarItemsGridProps) {
  const args: CellarItemsArgs = { search, types, sort, status };
  const now = useNow(asOf);
  const cacheKey = cellarItemsCacheKey(cellarId, args);

  // Prefer cached items when they're a superset of the server-provided batch
  // (i.e. the user had loaded beyond the initial page before navigating away).
  const [seed] = useState(() => {
    const cached = gridItemsCache.get(cacheKey);
    if (cached && cached.items.length > initialItems.length) {
      return {
        rows: cached.items,
        endCursor: cached.endCursor,
        hasNextPage: cached.hasNextPage,
        totalCount: cached.totalCount,
      };
    }
    return {
      rows: initialItems,
      endCursor: initialCursor,
      hasNextPage: initialHasNextPage,
      totalCount,
    };
  });

  const list = usePagedConnection({
    query: GetCellarItemGroupsQuery,
    variables: (current: CellarItemsArgs, after) =>
      cellarItemsVariables(cellarId, current, after),
    select: (data) => {
      const cellar = unwrapResult(data?.cellar, "Cellar");
      return cellar.ok
        ? {
            ok: true,
            data: toPage(cellar.data.itemGroups, (edge) =>
              cellarGroupCell(edge.node),
            ),
          }
        : cellar;
    },
    initial: seed,
    initialArgs: args,
  });
  const items = list.rows;
  const total = virtualTotal(list);
  const isLoadingMore = list.status === "loadingMore";

  // Accumulated row height measurements — persisted in the module cache so
  // the virtualizer's estimateSize returns accurate heights on back-nav,
  // giving pixel-perfect scroll restoration.
  const measurementsRef = useRef<Record<number, number>>(
    gridItemsCache.get(cacheKey)?.measurements ?? {},
  );

  // Keep the module cache in sync as the user loads more items.
  useEffect(() => {
    gridItemsCache.set(cacheKey, {
      items,
      endCursor: list.endCursor,
      hasNextPage: list.hasNextPage,
      totalCount: list.totalCount,
      measurements: measurementsRef.current,
    });
  }, [cacheKey, items, list.endCursor, list.hasNextPage, list.totalCount]);

  // Sync state when the server provides genuinely new data (revalidation).
  // On back-nav with a router cache hit, initialItems is the same reference
  // so the sync is skipped and the cache-populated state is preserved.
  // (An effect rather than the old set-state-during-render: the list is an
  // external store, and writing to it while rendering would update its
  // subscribers mid-render.)
  const prevInitial = useRef(initialItems);
  const { replace } = list;
  useEffect(() => {
    if (prevInitial.current === initialItems) return;
    prevInitial.current = initialItems;
    replace({
      rows: initialItems,
      endCursor: initialCursor,
      hasNextPage: initialHasNextPage,
      totalCount,
    });
    measurementsRef.current = {};
    gridItemsCache.delete(cacheKey);
  }, [
    initialItems,
    initialCursor,
    initialHasNextPage,
    totalCount,
    replace,
    cacheKey,
  ]);

  // Scroll restore target from sessionStorage. Using state (with lazy init)
  // avoids re-reading on every render while still allowing updates — the
  // popstate listener below re-reads on back/forward navigation when the
  // router cache is warm and the component is NOT remounted.
  const [scrollData, setScrollData] = useState<ScrollData | null>(
    readScrollData,
  );

  // Responsive column count
  const columnCount = useColumnCount();

  // Group loaded items into rows
  const loadedRows = useMemo(() => {
    const result: TransformedCellarItem[][] = [];
    for (let i = 0; i < items.length; i += columnCount) {
      result.push(items.slice(i, i + columnCount));
    }
    return result;
  }, [items, columnCount]);

  // Total row count (including unloaded) — drives scrollbar size
  const totalRows = Math.ceil(total / columnCount);

  // Find the scroll container (AppShell's <main data-app-scroller>, overflow-y: auto).
  // Must be state (not ref) so that setting it triggers a re-render — the virtualizer
  // needs to recalculate visible items once the scroll element is available.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!sentinelRef.current) return;
    let el: HTMLElement | null = sentinelRef.current.parentElement;
    while (el) {
      const style = getComputedStyle(el);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        // Pre-set scroll position BEFORE setScrollContainer triggers the
        // virtualizer to observe this element. When the virtualizer's
        // observeElementOffset fires synchronously during setup, it reads
        // the correct scrollTop — so it initializes at the target offset
        // and renders the right rows on the first paint.
        const data = readScrollData();
        if (data) {
          el.scrollTop = data.scrollTop;
        } else if (el.scrollTop > 0) {
          // The page was already scrolled when the grid mounted — a
          // dashboard tile's `#collection` (X04) lands while the grid is
          // still suspended. The virtualizer took its offset (0) before it had
          // a container and scrolls the container to it on attach, which
          // threw the reader back to the top; the restore below puts them
          // back where they landed, before paint.
          setScrollData({ scrollTop: el.scrollTop });
        }
        setScrollContainer(el);
        break;
      }
      el = el.parentElement;
    }
  }, []);

  // Virtualizer — count reflects total rows for accurate scrollbar sizing.
  // Unloaded rows use estimateSize; loaded rows are measured dynamically.
  // Higher overscan on mobile where rows are cheap (1-2 columns) to prevent
  // blank flashes during fast flick scrolling.
  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollContainer,
    // Use cached measurements from previous mount for accurate initial heights.
    // This makes scrollToOffset pixel-perfect on back-nav because the virtualizer
    // starts with the same heights it had when the scrollTop was saved.
    estimateSize: (index) =>
      measurementsRef.current[index] ?? ESTIMATED_ROW_HEIGHT,
    overscan: columnCount <= 2 ? 8 : 5,
    gap: 16,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Accumulate row measurements for the module cache.
  useEffect(() => {
    let changed = false;
    for (const vr of virtualRows) {
      if (measurementsRef.current[vr.index] !== vr.size) {
        measurementsRef.current[vr.index] = vr.size;
        changed = true;
      }
    }
    if (changed) {
      gridItemsCache.set(cacheKey, {
        items,
        endCursor: list.endCursor,
        hasNextPage: list.hasNextPage,
        totalCount: list.totalCount,
        measurements: measurementsRef.current,
      });
    }
  });

  // Eager load-more: trigger when visible rows approach the loaded boundary.
  // Buffer of 5 rows (~10-30 items depending on columns) for seamless scrolling.
  const lastVirtualIndex = virtualRows[virtualRows.length - 1]?.index ?? 0;
  const { canLoadMore, loadMore } = list;

  useEffect(() => {
    if (!canLoadMore) return;
    if (lastVirtualIndex >= loadedRows.length - 5) {
      void loadMore();
    }
  }, [lastVirtualIndex, loadedRows.length, canLoadMore, loadMore]);

  // Re-read scroll data on back/forward navigation. When the router cache is
  // warm the component is NOT remounted, so the lazy useState init above still
  // holds the value from the original mount (likely null). The popstate listener
  // picks up the freshly-written sessionStorage entry and re-arms scroll restore.
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      const data = readScrollData();
      if (data) {
        setScrollData(data);
        hasScrolledRef.current = false;
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Scroll restore — runs in useLayoutEffect (before paint) so the user
  // never sees the grid at the wrong position. For fresh mounts the scroll
  // container's scrollTop was already pre-set in the container-detection LE
  // above, so the virtualizer initialized at the correct offset. This LE
  // handles the popstate case (component stays mounted, needs repositioning)
  // and cleans up sessionStorage in both cases.
  useLayoutEffect(() => {
    if (hasScrolledRef.current || !scrollData || !scrollContainer) return;

    hasScrolledRef.current = true;
    virtualizer.scrollToOffset(scrollData.scrollTop);
    setScrollData(null);
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
  }, [scrollData, scrollContainer, virtualizer]);

  if (items.length === 0) {
    if (list.failure !== null) return <ApiError error={list.failure} />;
    return (
      <CellarItemsEmpty
        cellarId={cellarId}
        canAdd={canAdd}
        search={search}
        types={types}
        status={status}
      />
    );
  }

  return (
    <>
      {/* Sentinel for scroll container detection */}
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />

      {/* Virtualized grid — scroll position is set in useLayoutEffect (before
          paint), so the grid is always visible at the correct offset. */}
      <div
        data-slot="cellar-grid"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const row = loadedRows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className={cellarItemsGridClass()}>
                {row
                  ? row.map((x) => (
                      <div id={x.item.id} key={x.item.id} className="min-w-0">
                        <BottleCard
                          cell={x}
                          now={now}
                          href={cellarBottleHref(cellarId, x)}
                          onClick={() =>
                            writeScrollData(scrollContainer?.scrollTop ?? 0)
                          }
                        />
                      </div>
                    ))
                  : Array.from({ length: columnCount }, (_, colIndex) => {
                      const skeletonKey = `skeleton-${virtualRow.key}-${colIndex}`;
                      return <CellarItemSkeletonCard key={skeletonKey} />;
                    })}
              </div>
            </div>
          );
        })}
      </div>

      {list.failure !== null && <ApiError error={list.failure} />}

      {/* Loading indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Spinner className="size-5" />
        </div>
      )}
    </>
  );
}

interface ScrollData {
  scrollTop: number;
}

function readScrollData(): ScrollData | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (data.path !== window.location.pathname) return null;
    return { scrollTop: data.scrollTop ?? 0 };
  } catch {
    return null;
  }
}

function writeScrollData(scrollTop: number) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    SCROLL_STORAGE_KEY,
    JSON.stringify({ path: window.location.pathname, scrollTop }),
  );
}
