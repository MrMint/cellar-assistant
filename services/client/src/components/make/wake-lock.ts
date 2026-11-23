/**
 * ux-c L08 Make mode keeps the screen on: the Screen Wake Lock API, feature
 * detected. A browser without it (or one that refuses — low battery, a
 * hidden tab) simply lets the screen sleep; nothing about Make mode depends
 * on it. `wake-lock.test.ts` runs this with and without `navigator.wakeLock`.
 */
type WakeLockSentinelLike = {
  release(): Promise<void>;
};

export type WakeLockNavigator = {
  readonly wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinelLike>;
  };
};

/** Whether this browser can keep the screen on at all. */
export const wakeLockSupported = (
  nav: WakeLockNavigator | undefined,
): boolean => typeof nav?.wakeLock?.request === "function";

/**
 * Ask for a screen wake lock. Resolves to a release function, or `null` when
 * the API is missing or the request is refused — never a rejection.
 */
export const acquireWakeLock = async (
  nav: WakeLockNavigator | undefined,
): Promise<(() => Promise<void>) | null> => {
  if (!wakeLockSupported(nav)) return null;
  try {
    const sentinel = await nav?.wakeLock?.request("screen");
    if (sentinel === undefined) return null;
    return async () => {
      try {
        await sentinel.release();
      } catch {
        // Already released by the browser (the tab was hidden): nothing to do.
      }
    };
  } catch {
    return null;
  }
};
