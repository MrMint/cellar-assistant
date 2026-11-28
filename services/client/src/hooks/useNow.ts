"use client";

import { useEffect, useState } from "react";

/**
 * "Now", safe to render with. The first render — the server's and the
 * hydration pass — uses `seed` (the server's request time, passed down as a
 * prop), so both print the same "Open · 8d"; after mount it moves to the
 * browser's clock. A null seed renders no ages until then.
 */
export function useNow(seed: number | null): number | null {
  const [now, setNow] = useState(seed);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}
