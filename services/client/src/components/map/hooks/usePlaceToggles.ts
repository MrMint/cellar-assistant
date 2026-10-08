"use client";

import { useCallback } from "react";
import { notify } from "@/components/app/notify";
import {
  type OptimisticToggle,
  type ToggleCommitResult,
  useOptimisticToggle,
} from "@/hooks/useOptimisticToggle";

/** The patch `usePlaceDetails().setInteraction` writes. */
export type PlaceInteractionPatch = {
  isFavorite?: boolean;
  isVisited?: boolean;
};

/** `setInteraction`'s answer (an error message, or null) as a toggle result. */
export const toToggleResult = (error: string | null): ToggleCommitResult =>
  error === null ? { ok: true } : { ok: false, message: error };

/**
 * Save and Visited on a place (X24), for the place page and the map drawer
 * alike: each flips on the tap, writes through `recordPlaceInteraction`, and
 * settles on what the refetched interaction then says. Success needs no
 * toast — the control already changed; a refusal puts it back and says so.
 */
export function usePlaceToggles({
  saved,
  visited,
  setInteraction,
}: {
  saved: boolean;
  visited: boolean;
  /** Resolves to an error message, or null on success. */
  setInteraction: (patch: PlaceInteractionPatch) => Promise<string | null>;
}): { save: OptimisticToggle; visit: OptimisticToggle } {
  const commitSave = useCallback(
    async (next: boolean) =>
      toToggleResult(await setInteraction({ isFavorite: next })),
    [setInteraction],
  );
  const commitVisit = useCallback(
    async (next: boolean) =>
      toToggleResult(await setInteraction({ isVisited: next })),
    [setInteraction],
  );
  const save = useOptimisticToggle({
    value: saved,
    commit: commitSave,
    onError: (message) =>
      notify("Couldn't update Saved", { tone: "error", description: message }),
  });
  const visit = useOptimisticToggle({
    value: visited,
    commit: commitVisit,
    onError: (message) =>
      notify("Couldn't update Visited", {
        tone: "error",
        description: message,
      }),
  });
  return { save, visit };
}
