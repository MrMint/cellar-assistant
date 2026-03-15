"use client";

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
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";

const SCROLL_STORAGE_KEY = "scroll-restore";
const DEFAULT_ESTIMATED_ROW_HEIGHT = 340;

// Module-level measurement cache for pixel-perfect scroll restore.
// Keyed by caller-provided cacheKey so each list has isolated measurements.
const measurementsCache = new Map<string, Record<number, number>>();

// ---------------------------------------------------------------------------
// Grid breakpoints → column count
// ---------------------------------------------------------------------------

export interface GridBreakpoints {
  xs: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
}

/**
 * Resolves the number of columns for a given active breakpoint by cascading
 * down through the specified breakpoints (MUI behaviour: larger inherits
 * from smaller when not explicitly set).
 */
function resolveColumns(
  breakpoints: GridBreakpoints,
  active: "xs" | "sm" | "md" | "lg" | "xl",
): number {
  const order: ("xs" | "sm" | "md" | "lg" | "xl")[] = [
    "xs",
    "sm",
    "md",
    "lg",
    "xl",
  ];
  const idx = order.indexOf(active);
  for (let i = idx; i >= 0; i--) {
    const val = breakpoints[order[i]];
    if (val !== undefined) return Math.floor(12 / val);
  }
  return 1;
}

function useGridColumnCount(breakpoints: GridBreakpoints): number {
  const isSm = useMediaQuery(breakpointUp("sm"));
  const isMd = useMediaQuery(breakpointUp("md"));
  const isLg = useMediaQuery(breakpointUp("lg"));
  const isXl = useMediaQuery(breakpointUp("xl"));

  if (isXl) return resolveColumns(breakpoints, "xl");
  if (isLg) return resolveColumns(breakpoints, "lg");
  if (isMd) return resolveColumns(breakpoints, "md");
  if (isSm) return resolveColumns(breakpoints, "sm");
  return resolveColumns(breakpoints, "xs");
}

// ---------------------------------------------------------------------------
// Scroll position helpers (shared sessionStorage key, path-scoped)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// VirtualGrid component
// ---------------------------------------------------------------------------

export interface VirtualGridProps<T> {
  /** The loaded items to render. */
  items: T[];
  /** Total count including unloaded items (for load-more scrollbar sizing). Defaults to items.length. */
  totalCount?: number;
  /** Unique cache key for measurement persistence (e.g. page path + filter params). */
  cacheKey: string;
  /** Extract a unique key from each item. */
  getItemKey: (item: T) => string;
  /** Render a single item. Call `onBeforeNavigate` in the item's onClick to save scroll position. */
  renderItem: (item: T, onBeforeNavigate: () => void) => ReactNode;
  /** Optional custom skeleton for unloaded rows. Defaults to a card with image + text skeleton. */
  renderSkeleton?: () => ReactNode;
  /** Message shown when items array is empty. */
  emptyMessage?: string;
  /** MUI Grid breakpoints for each item (e.g. { xs: 6, sm: 6, md: 4, lg: 3, xl: 2 }). */
  gridBreakpoints: GridBreakpoints;
  /** Async callback to load more items. Called when scroll approaches loaded boundary. */
  onLoadMore?: () => Promise<void>;
  /** Whether a load-more request is in flight. */
  isLoadingMore?: boolean;
  /** Estimated height per row in pixels. Defaults to 340. */
  estimatedRowHeight?: number;
}

export function VirtualGrid<T>({
  items,
  totalCount,
  cacheKey,
  getItemKey,
  renderItem,
  renderSkeleton,
  emptyMessage = "No items found",
  gridBreakpoints,
  onLoadMore,
  isLoadingMore = false,
  estimatedRowHeight = DEFAULT_ESTIMATED_ROW_HEIGHT,
}: VirtualGridProps<T>) {
  const total = totalCount ?? items.length;

  // Row height measurements — persisted in the module cache so the
  // virtualizer's estimateSize returns accurate heights on back-nav.
  const measurementsRef = useRef<Record<number, number>>(
    measurementsCache.get(cacheKey) ?? {},
  );

  // Keep measurement cache in sync.
  useEffect(() => {
    measurementsCache.set(cacheKey, measurementsRef.current);
  }, [cacheKey]);

  // Scroll restore target from sessionStorage.
  const [scrollData, setScrollData] = useState<ScrollData | null>(
    readScrollData,
  );

  // Responsive column count derived from grid breakpoints.
  const columnCount = useGridColumnCount(gridBreakpoints);

  // Group items into rows.
  const loadedRows = useMemo(() => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += columnCount) {
      result.push(items.slice(i, i + columnCount));
    }
    return result;
  }, [items, columnCount]);

  // Total row count (including unloaded) — drives scrollbar size.
  const totalRows = Math.ceil(total / columnCount);

  // Find the scroll container (ConditionalPaddingWrapper with overflowY: auto).
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
        // Pre-set scroll position BEFORE the virtualizer observes this element.
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

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollContainer,
    estimateSize: (index) =>
      measurementsRef.current[index] ?? estimatedRowHeight,
    overscan: columnCount <= 2 ? 8 : 5,
    gap: 16,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Accumulate row measurements.
  useEffect(() => {
    let changed = false;
    for (const vr of virtualRows) {
      if (measurementsRef.current[vr.index] !== vr.size) {
        measurementsRef.current[vr.index] = vr.size;
        changed = true;
      }
    }
    if (changed) {
      measurementsCache.set(cacheKey, measurementsRef.current);
    }
  });

  // Eager load-more: trigger when visible rows approach loaded boundary.
  const lastVirtualIndex = virtualRows[virtualRows.length - 1]?.index ?? 0;
  const hasMore = items.length < total;

  useEffect(() => {
    if (!hasMore || isLoadingMore || !onLoadMore) return;
    if (lastVirtualIndex >= loadedRows.length - 5) {
      onLoadMore();
    }
  }, [lastVirtualIndex, loadedRows.length, hasMore, isLoadingMore, onLoadMore]);

  // Popstate listener — re-read scroll data on back/forward navigation
  // when the router cache is warm and the component is NOT remounted.
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

  // Scroll restore — runs before paint so the user never sees the wrong position.
  useLayoutEffect(() => {
    if (hasScrolledRef.current || !scrollData || !scrollContainer) return;
    hasScrolledRef.current = true;
    virtualizer.scrollToOffset(scrollData.scrollTop);
    setScrollData(null);
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
  }, [scrollData, scrollContainer, virtualizer]);

  // Save scroll position callback — passed to renderItem.
  const saveScrollPosition = useCallback(() => {
    writeScrollData(scrollContainer?.scrollTop ?? 0);
  }, [scrollContainer]);

  if (items.length === 0) {
    return (
      <Typography level="body-md" sx={{ textAlign: "center", py: 4 }}>
        {emptyMessage}
      </Typography>
    );
  }

  const defaultSkeleton = () => (
    <Card sx={{ overflow: "hidden" }}>
      <Skeleton
        variant="rectangular"
        sx={{ aspectRatio: { xs: 1.2, sm: 1 } }}
      />
      <Skeleton variant="text" sx={{ mx: 1, my: 1 }} />
      <Skeleton variant="rectangular" height={40} />
    </Card>
  );

  const skeletonRenderer = renderSkeleton ?? defaultSkeleton;

  return (
    <>
      {/* Sentinel for scroll container detection */}
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />

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
                  ? row.map((item) => (
                      <Grid
                        key={getItemKey(item)}
                        {...gridBreakpoints}
                      >
                        {renderItem(item, saveScrollPosition)}
                      </Grid>
                    ))
                  : Array.from({ length: columnCount }, (_, i) => (
                      <Grid
                        key={`skeleton-${virtualRow.index}-${i}`}
                        {...gridBreakpoints}
                      >
                        {skeletonRenderer()}
                      </Grid>
                    ))}
              </Grid>
            </Box>
          );
        })}
      </Box>

      {isLoadingMore && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size="sm" />
        </Box>
      )}
    </>
  );
}
