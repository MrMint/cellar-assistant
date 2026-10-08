/**
 * A tiny in-page bus for "this target's Want to try state just changed" —
 * so surfaces that hold their own copy of the list (the map's want-to-go
 * pins) follow a Save made somewhere else on the screen (the place sheet)
 * without a refetch. Fired only after the server confirmed the change.
 *
 * Plain module state, no React: a listener is a function, and the map's
 * hook subscribes in an effect.
 */
import { targetKey, type WantToTryTarget } from "./adapter";

export type WantToTryChange = { readonly key: string; readonly saved: boolean };

type Listener = (change: WantToTryChange) => void;

const listeners = new Set<Listener>();

export const onWantToTryChange = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const announceWantToTry = (
  target: WantToTryTarget,
  saved: boolean,
): void => {
  const change = { key: targetKey(target), saved };
  for (const listener of Array.from(listeners)) listener(change);
};

/**
 * `ids` (place ids from the server) with the confirmed changes since applied
 * on top — `overrides` keyed by `place:<id>`.
 */
export const withPlaceOverrides = (
  ids: Iterable<string>,
  overrides: ReadonlyMap<string, boolean>,
): Set<string> => {
  const result = new Set(ids);
  for (const [key, saved] of Array.from(overrides.entries())) {
    if (!key.startsWith("place:")) continue;
    const id = key.slice("place:".length);
    if (saved) result.add(id);
    else result.delete(id);
  }
  return result;
};
