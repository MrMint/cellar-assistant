"use client";

import { useCallback, useRef } from "react";

/**
 * Custom debounced callback hook - replacement for use-debounce package
 * Debounces function execution to prevent excessive calls
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const debouncedCallback = useCallback(
    (...args: TArgs) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );

  return debouncedCallback;
}
