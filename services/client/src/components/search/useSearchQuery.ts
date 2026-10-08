"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialSearchNavState,
  planCommitNavigation,
  planTypingNavigation,
  SEARCH_DEBOUNCE_MS,
  type SearchNavigation,
  type SearchNavStep,
  syncFromUrl,
} from "./search-navigation";

type UseSearchQueryOptions = {
  /** The `?q=` the page was rendered for (trimmed), or null. */
  urlQuery: string | null | undefined;
  /** Performs a navigation — the caller wraps it in its transition. */
  navigate: (navigation: SearchNavigation) => void;
  /** A navigation is in flight (the transition is pending). */
  isNavigating: boolean;
};

/**
 * The search box's text and its URL (N01): the rules live in
 * `search-navigation.ts`; this hook only owns the timer and the refs. It holds
 * no markup, so the shadcn migration swaps the `<Input>` and keeps this.
 *
 * - `onChange` updates the text at once and navigates after the debounce
 *   (`replace` inside a typing session, `push` to open one).
 * - `commit` (Enter, blur) and `clear` flush the debounce and close the
 *   session.
 * - A URL query that is not the box's own echo (Back, Forward, a link)
 *   replaces the text — but never while a debounce is waiting or a navigation
 *   is in flight.
 */
export function useSearchQuery({
  urlQuery,
  navigate,
  isNavigating,
}: UseSearchQueryOptions) {
  const [value, setValue] = useState(urlQuery ?? "");
  const valueRef = useRef(value);
  const navStateRef = useRef(initialSearchNavState(urlQuery));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // The timer outlives the render that armed it; read `navigate` fresh.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const run = useCallback((step: SearchNavStep) => {
    navStateRef.current = step.state;
    if (step.navigation !== null) navigateRef.current(step.navigation);
  }, []);

  const cancelDebounce = useCallback(() => {
    if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
  }, []);

  const update = useCallback((next: string) => {
    valueRef.current = next;
    setValue(next);
  }, []);

  const onChange = useCallback(
    (next: string) => {
      update(next);
      cancelDebounce();
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        run(planTypingNavigation(navStateRef.current, next));
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelDebounce, run, update],
  );

  const commit = useCallback(() => {
    cancelDebounce();
    run(planCommitNavigation(navStateRef.current, valueRef.current));
  }, [cancelDebounce, run]);

  const clear = useCallback(() => {
    cancelDebounce();
    update("");
    run(planCommitNavigation(navStateRef.current, ""));
  }, [cancelDebounce, run, update]);

  useEffect(() => {
    const sync = syncFromUrl(
      navStateRef.current,
      urlQuery,
      isNavigating || debounceRef.current !== undefined,
    );
    navStateRef.current = sync.state;
    if (sync.value !== null) update(sync.value);
  }, [urlQuery, isNavigating, update]);

  useEffect(() => cancelDebounce, [cancelDebounce]);

  return { value, onChange, commit, clear };
}
