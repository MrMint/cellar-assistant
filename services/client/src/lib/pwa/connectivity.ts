/**
 * Online/offline as an external store, plus the one reaction the shell needs:
 * do something once the connection is back.
 *
 * Pure functions over an `EventTarget`-shaped value rather than `window`
 * itself, so they can be tested without a browser; `useOnlineStatus` binds
 * them to `window` and `navigator`.
 *
 * `navigator.onLine === false` is reliable (there is no network interface);
 * `true` only means "maybe". So the shell uses it to choose *copy*, never to
 * refuse a retry.
 */

type ConnectivityTarget = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
>;

/** `useSyncExternalStore`'s subscribe: any `online`/`offline` change. */
export const subscribeToConnectivity = (
  target: ConnectivityTarget,
  onChange: () => void,
): (() => void) => {
  target.addEventListener("online", onChange);
  target.addEventListener("offline", onChange);
  return () => {
    target.removeEventListener("online", onChange);
    target.removeEventListener("offline", onChange);
  };
};

/** Call `callback` the next time the connection comes back, once. */
export const onceBackOnline = (
  target: ConnectivityTarget,
  callback: () => void,
): (() => void) => {
  const listener = () => {
    target.removeEventListener("online", listener);
    callback();
  };
  target.addEventListener("online", listener);
  return () => target.removeEventListener("online", listener);
};
