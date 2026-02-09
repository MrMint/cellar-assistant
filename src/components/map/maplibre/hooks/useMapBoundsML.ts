"use client";

import { useCallback, useRef, useState } from "react";
import type { MapBounds } from "../../types";

const DEBOUNCE_DESKTOP = 500;
const DEBOUNCE_MOBILE = 600;

export function useMapBoundsML() {
  const [bounds, setBounds] = useState<MapBounds | undefined>();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleBoundsChange = useCallback((newBounds: MapBounds) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const delay = isMobile ? DEBOUNCE_MOBILE : DEBOUNCE_DESKTOP;
    timerRef.current = setTimeout(() => {
      setBounds(newBounds);
    }, delay);
  }, []);

  return { bounds, handleBoundsChange };
}
