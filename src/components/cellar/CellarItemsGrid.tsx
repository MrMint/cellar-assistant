"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import {
  Box,
  Card,
  CircularProgress,
  Grid,
  Skeleton,
  Typography,
} from "@mui/joy";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ITEMS_PAGE_SIZE } from "@/app/(authenticated)/cellars/[cellarId]/items/searchParams";
import { ItemCard } from "@/components/item/ItemCard";
import { useColumnCount } from "@/hooks/useColumnCount";
import { formatItemType } from "@/utilities";
import { loadMoreCellarItemsAction } from "./cellarItemsActions";
import type { TransformedCellarItem } from "./cellarItemsServer";

const SCROLL_STORAGE_KEY = "scroll-restore";
const ESTIMATED_ROW_HEIGHT = 340;

// Module-level cache — survives unmount/remount within the same SPA session.
// On back-navigation the component initializes from this cache (all previously
// loaded items + row height measurements) so scroll restore is pixel-perfect.
const gridItemsCache = new Map<
  string,
  {
    items: TransformedCellarItem[];
    total: number;
    measurements: Record<number, number>;
  }
>();

function getCacheKey(
  cellarId: string,
  search: string,
  types: ItemTypeValue[],
): string {
  return `${cellarId}\0${search}\0${types.join(",")}`;
}

interface CellarItemsGridProps {
  initialItems: TransformedCellarItem[];
  totalCount: number;
  cellarId: string;
  search: string;
  types: ItemTypeValue[];
}

export function CellarItemsGrid({
  initialItems,
  totalCount,
  cellarId,
  search,
  types,
}: CellarItemsGridProps) {
  const cacheKey = getCacheKey(cellarId, search, types);

  // Prefer cached items when they're a superset of the server-provided batch
  // (i.e. the user had loaded beyond the initial page before navigating away).
  const [items, setItems] = useState(() => {
    const cached = gridItemsCache.get(cacheKey);
    if (cached && cached.items.length > initialItems.length) {
      return cached.items;
    }
    return initialItems;
  });
  const [total, setTotal] = useState(() => {
    const cached = gridItemsCache.get(cacheKey);
    if (cached && cached.items.length > initialItems.length) {
      return cached.total;
    }
    return totalCount;
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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
      total,
      measurements: measurementsRef.current,
    });
  }, [cacheKey, items, total]);

  // Sync state when the server provides genuinely new data (revalidation).
  // On back-nav with a router cache hit, initialItems is the same reference
  // so the sync is skipped and the cache-populated state is preserved.
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (prevInitial !== initialItems) {
    setPrevInitial(initialItems);
    setItems(initialItems);
    setTotal(totalCount);
    measurementsRef.current = {};
    gridItemsCache.delete(cacheKey);
  }

  // Scroll restore target from sessionStorage. Using state (with lazy init)
  // avoids re-reading on every render while still allowing updates — the
  // popstate listener below re-reads on back/forward navigation when the
  // router cache is warm and the component is NOT remounted.
  const [scrollData, setScrollData] = useState<ScrollData | null>(
    readScrollData,
  );

  // Responsive column count
  const columnCount = useColumnCount(items.length);

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

  // Find the scroll container (ConditionalPaddingWrapper with overflowY: auto).
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
        total,
        measurements: measurementsRef.current,
      });
    }
  });

  // Eager load-more: trigger when visible rows approach the loaded boundary.
  // Buffer of 5 rows (~10-30 items depending on columns) for seamless scrolling.
  const hasMore = items.length < total;
  const lastVirtualIndex = virtualRows[virtualRows.length - 1]?.index ?? 0;

  const loadMore = useCallback(
    async (batchSize = ITEMS_PAGE_SIZE) => {
      if (isLoadingMore || !hasMore) return;
      setIsLoadingMore(true);

      try {
        const result = await loadMoreCellarItemsAction(
          cellarId,
          search,
          types,
          items.length,
          batchSize,
        );

        setItems((prev) => [...prev, ...result.items]);
        setTotal(result.totalCount);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [isLoadingMore, hasMore, cellarId, search, types, items.length],
  );

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    if (lastVirtualIndex >= loadedRows.length - 5) {
      loadMore();
    }
  }, [lastVirtualIndex, loadedRows.length, hasMore, isLoadingMore, loadMore]);

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
    return (
      <Typography level="body-md" sx={{ textAlign: "center", py: 4 }}>
        No items in this cellar
      </Typography>
    );
  }

  return (
    <>
      {/* Sentinel for scroll container detection */}
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />

      {/* Virtualized grid — scroll position is set in useLayoutEffect (before
          paint), so the grid is always visible at the correct offset. */}
      <Box
        sx={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = loadedRows[virtualRow.index];
          return (
            <Box
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <Grid container spacing={2}>
                {row
                  ? row.map((x) => (
                      <Grid
                        id={x.item.id}
                        key={x.item.id}
                        xs={items.length > 6 ? 6 : 12}
                        sm={6}
                        md={4}
                        lg={3}
                        xl={2}
                      >
                        <ItemCard
                          item={x.item}
                          type={x.type}
                          href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
                          onClick={() =>
                            writeScrollData(scrollContainer?.scrollTop ?? 0)
                          }
                        />
                      </Grid>
                    ))
                  : Array.from({ length: columnCount }, (_, i) => (
                      <Grid
                        key={`skeleton-${virtualRow.index}-${i}`}
                        xs={items.length > 6 ? 6 : 12}
                        sm={6}
                        md={4}
                        lg={3}
                        xl={2}
                      >
                        <Card sx={{ overflow: "hidden" }}>
                          <Skeleton
                            variant="rectangular"
                            sx={{ aspectRatio: { xs: 1.2, sm: 1 } }}
                          />
                          <Skeleton variant="text" sx={{ mx: 1, my: 1 }} />
                          <Skeleton variant="rectangular" height={40} />
                        </Card>
                      </Grid>
                    ))}
              </Grid>
            </Box>
          );
        })}
      </Box>

      {/* Loading indicator */}
      {isLoadingMore && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size="sm" />
        </Box>
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
