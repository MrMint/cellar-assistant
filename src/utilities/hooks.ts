import { useEffect, useRef } from "react";

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
