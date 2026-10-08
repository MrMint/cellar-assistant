"use client";

import { useRouter } from "next/navigation";
import { useCallback, useReducer } from "react";
import { useMutation } from "urql";
import {
  EmptyCellarItemMutation,
  UpdateCellarItemMutation,
} from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import {
  type FinishDeps,
  type FinishSnapshot,
  type FinishState,
  finishReducer,
  initialFinishState,
  performFinish,
  performRestore,
  performUndo,
  type WriteOutcome,
} from "./finish-bottle";

export type FinishBottle = {
  state: FinishState;
  /** The slider settled on 0%: ask "Finished it?". */
  request: (snapshot: FinishSnapshot) => void;
  /** Finish without asking (the delete dialog's "Mark finished instead"). */
  finishNow: (snapshot: FinishSnapshot) => void;
  confirm: () => void;
  cancel: () => void;
  undo: () => void;
  dismiss: () => void;
  /** "Restore to cellar" on a bottle finished earlier (no snapshot left). */
  restore: (percentageRemaining: number) => void;
};

/**
 * N13a's state and writes for one bottle, over `finish-bottle.ts`. Markup
 * lives in `FinishBottleDialogs.tsx` (the N27 sheet and the Undo toast); the
 * shadcn migration kept this hook as it was.
 */
export function useFinishBottle({
  cellarId,
  cellarItemId,
}: {
  cellarId: string;
  cellarItemId: string;
}): FinishBottle {
  const router = useRouter();
  const [state, dispatch] = useReducer(finishReducer, initialFinishState);
  const [, emptyItem] = useMutation(EmptyCellarItemMutation);
  const [, updateItem] = useMutation(UpdateCellarItemMutation);

  const deps: FinishDeps = {
    dispatch,
    empty: async (): Promise<WriteOutcome> => {
      const result = unwrapResult(
        (await emptyItem({ cellarId, cellarItemId })).data?.emptyCellarItem,
        "CellarItem",
      );
      return result.ok
        ? { ok: true }
        : { ok: false, message: result.error.message };
    },
    update: async (input): Promise<WriteOutcome> => {
      const result = unwrapResult(
        (await updateItem({ cellarId, cellarItemId, input })).data
          ?.updateCellarItem,
        "CellarItem",
      );
      return result.ok
        ? { ok: true }
        : { ok: false, message: result.error.message };
    },
    refresh: () => router.refresh(),
  };

  const request = useCallback(
    (snapshot: FinishSnapshot) => dispatch({ type: "REQUEST", snapshot }),
    [],
  );

  return {
    state,
    request,
    finishNow: (snapshot) => {
      if (state.phase !== "idle" && state.phase !== "confirming") return;
      dispatch({ type: "FINISH_NOW", snapshot });
      void performFinish(deps);
    },
    confirm: () => {
      if (state.phase !== "confirming") return;
      dispatch({ type: "CONFIRM" });
      void performFinish(deps);
    },
    cancel: () => dispatch({ type: "CANCEL" }),
    undo: () => {
      if (state.phase !== "finished" && state.phase !== "undoFailed") return;
      dispatch({ type: "UNDO" });
      void performUndo(deps, state.snapshot);
    },
    dismiss: () => dispatch({ type: "DISMISS" }),
    restore: (percentageRemaining) => {
      if (state.phase !== "idle") return;
      dispatch({ type: "RESTORE" });
      void performRestore(deps, percentageRemaining);
    },
  };
}
