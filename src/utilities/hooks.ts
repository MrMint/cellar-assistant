import { ItemType } from "@shared/gql/graphql";
import { useRouter, useSearchParams } from "next/navigation";
import { isEmpty, isNotNil } from "ramda";
import {
  startTransition,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { RankingsFilterValue } from "@/components/ranking/RankingsFilter";
import { getEnumKeys } from ".";

export function useInterval(callback: () => void, delay: number) {
  const intervalRef = useRef<any>(null);
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    const tick = () => savedCallback.current();
    intervalRef.current = window.setInterval(tick, delay);
    return () => window.clearInterval(intervalRef.current);
  }, [delay]);
  return intervalRef;
}

const getHash = () =>
  typeof window !== "undefined"
    ? decodeURIComponent(window.location.hash.replace("#", ""))
    : undefined;

export const useHash = () => {
  const [hash, setHash] = useState(getHash());

  useEffect(() => {
    const handleHashChange = () => {
      setHash(getHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return hash;
};

export const useScrollRestore = () => {
  const hash = useHash();
  const scrollTargetRef = useRef<HTMLDivElement>(null);

  const setScrollId = (id: string) => {
    // TODO switch to simple hash update when nextjs fixes bug
    // https://github.com/vercel/next.js/issues/56112
    //window.location.hash = x.item.id;
    window.history.replaceState(window.history.state, "", `#${id}`);
  };

  // Scroll to element on navigate back
  useEffect(() => {
    if (isNotNil(scrollTargetRef.current)) {
      scrollTargetRef.current.scrollIntoView({ block: "center" });
    }
  }, []);

  return { scrollId: hash, scrollTargetRef, setScrollId };
};

export const useTypesFilterState = () => {
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams());

  const types = searchParams.get("types");
  const parsedTypes = isNotNil(types) ? JSON.parse(types) : undefined;
  const [optimisticTypes, setOptimisticTypes] =
    useOptimistic<ItemType[]>(parsedTypes);

  const setTypes = (t: ItemType[]) => {
    if (isEmpty(t) || t.length >= getEnumKeys(ItemType).length) {
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
