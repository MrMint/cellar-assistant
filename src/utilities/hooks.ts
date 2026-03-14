import { ITEM_TYPES, type ItemTypeValue } from "@cellar-assistant/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isEmpty, isNotNil } from "ramda";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import type { RankingsFilterValue } from "@/components/ranking/RankingsFilter";

const SCROLL_STORAGE_KEY = "scroll-restore";

interface ScrollPositionData {
  scrollTop: number;
}

function readScrollPositionData(): ScrollPositionData | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (data.path !== window.location.pathname) return null;
    return typeof data.scrollTop === "number"
      ? { scrollTop: data.scrollTop }
      : null;
  } catch {
    return null;
  }
}

function writeScrollPositionData(scrollTop: number) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    SCROLL_STORAGE_KEY,
    JSON.stringify({ path: window.location.pathname, scrollTop }),
  );
}

/**
 * Pixel-perfect scroll position restore. Finds the nearest scrollable ancestor,
 * pre-sets scrollTop before first paint, and handles warm router cache via
 * popstate listener (component not remounted on back-nav).
 */
export function useScrollPositionRestore() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );
  const [scrollData, setScrollData] = useState<ScrollPositionData | null>(
    readScrollPositionData,
  );
  const hasScrolledRef = useRef(false);

  // Find scroll container and pre-set scrollTop before first paint.
  useLayoutEffect(() => {
    if (!sentinelRef.current) return;
    let el: HTMLElement | null = sentinelRef.current.parentElement;
    while (el) {
      const style = getComputedStyle(el);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        const data = readScrollPositionData();
        if (data) el.scrollTop = data.scrollTop;
        setScrollContainer(el);
        break;
      }
      el = el.parentElement;
    }
  }, []);

  // Re-arm scroll restore on back/forward nav when router cache is warm
  // (component stays mounted, popstate fires instead of remount).
  useEffect(() => {
    const handlePopState = () => {
      const data = readScrollPositionData();
      if (data) {
        setScrollData(data);
        hasScrolledRef.current = false;
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Apply scroll restore for the popstate case (pre-set already handled initial mount).
  useLayoutEffect(() => {
    if (hasScrolledRef.current || !scrollData || !scrollContainer) return;
    hasScrolledRef.current = true;
    scrollContainer.scrollTop = scrollData.scrollTop;
    setScrollData(null);
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
  }, [scrollData, scrollContainer]);

  const saveScrollPosition = useCallback(() => {
    writeScrollPositionData(scrollContainer?.scrollTop ?? 0);
  }, [scrollContainer]);

  return { sentinelRef, saveScrollPosition };
}

/**
 * Hook for restoring scroll position to a specific element after navigation.
 * Uses sessionStorage to track which element to scroll to, avoiding URL pollution.
 */
export const useScrollRestore = () => {
  const pathname = usePathname();
  const scrollTargetRef = useRef<HTMLDivElement>(null);

  // Get the stored scroll target ID for this path
  const getScrollId = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
      if (!stored) return null;
      const data = JSON.parse(stored);
      return data.path === pathname ? data.id : null;
    } catch {
      return null;
    }
  };

  // Save the scroll target ID for this path
  const setScrollId = (id: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      SCROLL_STORAGE_KEY,
      JSON.stringify({ path: pathname, id }),
    );
  };

  const scrollId = getScrollId();

  // Scroll to element on mount if we have a stored target
  useEffect(() => {
    if (isNotNil(scrollTargetRef.current)) {
      scrollTargetRef.current.scrollIntoView({ block: "center" });
      // Clear after scrolling to prevent re-scrolling on re-renders
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    }
  }, []);

  return { scrollId, scrollTargetRef, setScrollId };
};

export function useInterval(callback: () => void, delay: number) {
  const intervalRef = useRef<number | null>(null);
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    const tick = () => savedCallback.current();
    intervalRef.current = window.setInterval(tick, delay);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [delay]);
  return intervalRef;
}

export const useTypesFilterState = () => {
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams());

  const types = searchParams.get("types");
  const parsedTypes = isNotNil(types) ? JSON.parse(types) : undefined;
  const [optimisticTypes, setOptimisticTypes] =
    useOptimistic<ItemTypeValue[]>(parsedTypes);

  const setTypes = (t: ItemTypeValue[]) => {
    if (isEmpty(t) || t.length >= ITEM_TYPES.length) {
      startTransition(() => setOptimisticTypes([]));
      searchParams.delete("types");
    } else {
      startTransition(() => setOptimisticTypes(t));
      searchParams.set("types", JSON.stringify(t));
    }
    router.replace(`?${searchParams}`);
  };

  return { types: optimisticTypes, setTypes };
};

export const useReviewersFilterState = () => {
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams());

  const reviewers = searchParams.get("reviewers");
  const parsedReviewers = isNotNil(reviewers)
    ? JSON.parse(reviewers)
    : undefined;
  const [optimisticReviewers, setOptimisticReviewers] =
    useOptimistic<RankingsFilterValue[]>(parsedReviewers);

  const setReviewers = (r: RankingsFilterValue[]) => {
    if (isEmpty(r)) {
      startTransition(() => setOptimisticReviewers([]));
      searchParams.delete("reviewers");
    } else {
      startTransition(() => setOptimisticReviewers(r));
      searchParams.set("reviewers", JSON.stringify(r));
    }
    router.replace(`?${searchParams}`);
  };

  return { reviewers: optimisticReviewers, setReviewers };
};
