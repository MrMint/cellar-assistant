import { isNotNil } from "ramda";
import { useEffect, useRef, useState } from "react";

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
