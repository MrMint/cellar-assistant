import { ITEM_TYPES, type ItemTypeValue } from "@cellar-assistant/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isEmpty, isNotNil } from "ramda";
import { startTransition, useEffect, useOptimistic, useRef } from "react";
import type { RankingsFilterValue } from "@/components/ranking/RankingsFilter";

const SCROLL_STORAGE_KEY = "scroll-restore";

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

export const useSearchFilterState = () => {
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams());

  const search = searchParams.get("search") ?? undefined;

  const setSearch = (search: string) => {
    if (isEmpty(search)) {
      searchParams.delete("search");
    } else {
      searchParams.set("search", search);
    }
    router.replace(`?${searchParams}`);
  };

  return { search, setSearch };
};
