"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { unwrapResult } from "@/lib/api/result";
import {
  targetInput,
  targetKey,
  type WantToTryTarget,
  wantToTryMessage,
} from "./adapter";
import { announceWantToTry } from "./changes";
import { SetWantToTryMutation } from "./queries";

export type UseWantToTryOptions = {
  target: WantToTryTarget;
  /** The server's state when this rendered (`isWantToTry`, `wantToVisit`). */
  initial: boolean;
  /** Named in the toast: "Barolo is on Want to try". */
  name?: string;
  /** After every change the server confirmed, with the state it is now in. */
  onChange?: (saved: boolean) => void;
};

export type UseWantToTry = {
  saved: boolean;
  pending: boolean;
  /** Flip it, optimistically; a toast confirms with Undo, or says it failed. */
  toggle: () => Promise<void>;
};

/**
 * One Save target's state (X08, D27). Optimistic: the bookmark fills on tap,
 * goes back if the server refuses, and the toast offers Undo for five seconds
 * — a reversible action never asks first (design §4.7). `setWantToTry` is a
 * `set`, not a toggle, so Undo sends the state it wants back and a double tap
 * cannot land the wrong way round.
 */
export function useWantToTry({
  target,
  initial,
  name,
  onChange,
}: UseWantToTryOptions): UseWantToTry {
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [, setWantToTry] = useMutation(SetWantToTryMutation);
  const key = targetKey(target);

  // A newer server answer (a refetch, a cache update) wins over local state —
  // but never in the middle of a change this hook is making.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!inFlight.current) setSaved(initial);
  }, [initial]);

  const latest = useRef({ target, name, onChange });
  latest.current = { target, name, onChange };

  const send = useCallback(
    async (next: boolean): Promise<boolean> => {
      const response = await setWantToTry({
        target: targetInput(latest.current.target),
        wantToTry: next,
      });
      const result = unwrapResult(
        response.data?.setWantToTry,
        "SetWantToTryPayload",
      );
      return result.ok ? result.data.wantToTry === next : false;
    },
    [setWantToTry],
  );

  const apply = useCallback(
    async (next: boolean, offerUndo: boolean): Promise<void> => {
      inFlight.current = true;
      setPending(true);
      setSaved(next);
      let ok = false;
      try {
        ok = await send(next);
      } catch {
        ok = false;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
      if (!ok) {
        setSaved(!next);
        notify(
          next
            ? "Couldn't save to Want to try. Try again."
            : "Couldn't remove it from Want to try. Try again.",
          { tone: "error", id: `want-to-try:${key}` },
        );
        return;
      }
      announceWantToTry(latest.current.target, next);
      latest.current.onChange?.(next);
      notify(wantToTryMessage(next, latest.current.name), {
        id: `want-to-try:${key}`,
        ...(offerUndo ? { undo: () => void apply(!next, false) } : {}),
      });
    },
    [key, send],
  );

  const toggle = useCallback(() => apply(!saved, true), [apply, saved]);

  return { saved, pending, toggle };
}
