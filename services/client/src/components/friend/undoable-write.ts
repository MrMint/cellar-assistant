"use client";

import { useCallback, useEffect, useRef } from "react";
import { dismissNotification, notify } from "@/components/app/notify";

type Held = { readonly commit: () => void; readonly toastId: string | number };

/**
 * A write that waits out its Undo toast (KIT § 4 "Toast or confirm", F-91).
 * Declining someone's request can't be put back by a second write — only
 * they can ask again — so the write is held, not sent: the caller hides the
 * row at once, and the write goes when the toast closes (its time runs out,
 * or it is swiped away). Undo drops it and `restore`s the row. Leaving the
 * page sends every write still held and takes its toast down, so an Undo is
 * never offered for a write that has already gone. `drop` lets one go
 * unsent, as Undo would, and takes its toast down.
 */
export function useUndoableWrite() {
  const held = useRef(new Map<string, Held>());

  useEffect(() => {
    const writes = held.current;
    return () => {
      writes.forEach(({ commit, toastId }) => {
        dismissNotification(toastId);
        commit();
      });
      writes.clear();
    };
  }, []);

  const hold = useCallback(
    (
      key: string,
      write: {
        readonly message: string;
        readonly commit: () => void;
        readonly restore: () => void;
      },
    ) => {
      const settle = () => {
        const entry = held.current.get(key);
        if (entry === undefined) return;
        held.current.delete(key);
        entry.commit();
      };
      const toastId = notify(write.message, {
        undo: () => {
          if (held.current.delete(key)) write.restore();
        },
        onAutoClose: settle,
        onClose: settle,
      });
      held.current.set(key, { commit: write.commit, toastId });
    },
    [],
  );
  const drop = useCallback((key: string): boolean => {
    const entry = held.current.get(key);
    if (entry === undefined) return false;
    held.current.delete(key);
    dismissNotification(entry.toastId);
    return true;
  }, []);
  return { hold, drop };
}
