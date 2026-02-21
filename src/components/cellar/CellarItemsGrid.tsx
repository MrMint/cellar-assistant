"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { Box, Card, CircularProgress, Grid, Skeleton, Typography } from "@mui/joy";
import { useVirtualizer } from "@tanstack/react-virtual";
import { parseAsInteger, useQueryState } from "nuqs";
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
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(totalCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Sync state when the server provides new initialItems without a remount
  // (e.g., revalidation or router cache miss that doesn't trigger Suspense).
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (prevInitial !== initialItems) {
    setPrevInitial(initialItems);
    setItems(initialItems);
    setTotal(totalCount);
  }

  // nuqs limit param — shallow: true so load-more doesn't trigger server
  // re-renders (which are slow and block the UI). The URL still gets updated
  // via history.replaceState, so back-navigation carries the correct limit.
  // On cache miss, loading.tsx shows while the server renders the right slice.
  const [, setLimit] = useQueryState(
    "limit",
    parseAsInteger.withDefault(ITEMS_PAGE_SIZE).withOptions({ shallow: true }),
  );

  // Scroll restore target from sessionStorage. Using state (with lazy init)
  // avoids re-reading on every render while still allowing updates — the
  // popstate listener below re-reads on back/forward navigation when the
  // router cache is warm and the component is NOT remounted.
  const [scrollData, setScrollData] = useState<ScrollData | null>(
    readScrollData,
  );
  const [isRestoringScroll, setIsRestoringScroll] = useState(() => {
    if (!scrollData) return false;
    // Skip hiding if the target is already in the initial batch
    return !initialItems.some((x) => x.item.id === scrollData.id);
  });

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
        setScrollContainer(el);
        break;
      }
      el = el.parentElement;
    }
  }, []);

  // Virtualizer — count reflects total rows for accurate scrollbar sizing.
  // Unloaded rows use estimateSize; loaded rows are measured dynamically.
  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollContainer,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 3,
    gap: 16,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Eager load-more: trigger when visible rows approach the loaded boundary.
  // Buffer of 5 rows (~10-30 items depending on columns) for seamless scrolling.
  const hasMore = items.length < total;
  const lastVirtualIndex = virtualRows[virtualRows.length - 1]?.index ?? 0;

  const loadMore = useCallback(async (batchSize = ITEMS_PAGE_SIZE) => {
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

      const newLength = items.length + result.items.length;
      setItems((prev) => [...prev, ...result.items]);
      setTotal(result.totalCount);

      setLimit(newLength);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, cellarId, search, types, items.length, setLimit]);

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
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const handlePopState = () => {
      const data = readScrollData();
      if (data) {
        // Only hide the grid if the target item isn't loaded yet —
        // the useLayoutEffect scroll restore will handle it before paint.
        const needsLoad = !itemsRef.current.some(
          (x) => x.item.id === data.id,
        );
        // setScrollData triggers a re-render; the useLayoutEffect scroll
        // restore runs before paint, so the grid never appears at the wrong
        // position even when isRestoringScroll stays false.
        setScrollData(data);
        if (needsLoad) {
          setIsRestoringScroll(true);
        }
        hasScrolledRef.current = false;
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Scroll restore — runs as a layout effect (before paint) so the user never
  // sees the grid at the wrong position. If the target item isn't in the
  // initial batch, loads exactly the missing items in one shot using the
  // stored itemCount. If the item was deleted (all expected items loaded but
  // target not found), gives up gracefully.
  useLayoutEffect(() => {
    if (
      hasScrolledRef.current ||
      !scrollData ||
      !scrollContainer ||
      loadedRows.length === 0
    )
      return;

    const rowIndex = loadedRows.findIndex((row) =>
      row.some((item) => item.item.id === scrollData.id),
    );

    if (rowIndex >= 0) {
      hasScrolledRef.current = true;
      virtualizer.scrollToIndex(rowIndex, { align: "center" });
      setIsRestoringScroll(false);
      setScrollData(null);
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    } else if (hasMore && !isLoadingMore && scrollData.itemCount > items.length) {
      // Load exactly the missing items in one shot
      loadMore(scrollData.itemCount - items.length);
    } else if (!isLoadingMore) {
      // Item was deleted or all expected items loaded — give up, show grid at top
      hasScrolledRef.current = true;
      setIsRestoringScroll(false);
      setScrollData(null);
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    }
    // else: loading in progress, wait for it to complete
  }, [
    scrollData,
    scrollContainer,
    loadedRows,
    virtualizer,
    hasMore,
    isLoadingMore,
    loadMore,
    items.length,
  ]);

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

      {/* Loading overlay while scroll restore loads missing batches */}
      {isRestoringScroll && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size="sm" />
        </Box>
      )}

      {/* Virtualized grid — invisible (not removed) during scroll restore so
          the virtualizer keeps its full layout and scrollToIndex works. */}
      <Box
        sx={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
          ...(isRestoringScroll && { visibility: "hidden" }),
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
                          onClick={() => writeScrollData(x.item.id, items.length)}
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
  id: string;
  itemCount: number;
}

function readScrollData(): ScrollData | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (data.path !== window.location.pathname) return null;
    return { id: data.id, itemCount: data.itemCount ?? Infinity };
  } catch {
    return null;
  }
}

function writeScrollData(id: string, itemCount: number) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    SCROLL_STORAGE_KEY,
    JSON.stringify({ path: window.location.pathname, id, itemCount }),
  );
}
