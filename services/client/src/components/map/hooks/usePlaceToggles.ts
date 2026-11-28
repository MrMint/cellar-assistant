"use client";

import { useCallback } from "react";
import { notify } from "@/components/app/notify";
import { announceWantToTry } from "@/components/want-to-try/changes";
import {
  type OptimisticToggle,
  type ToggleCommitResult,
  useOptimisticToggle,
} from "@/hooks/useOptimisticToggle";
import { visitToastText } from "../places/place-utils";

/** The patch `usePlaceDetails().setInteraction` writes. */
export type PlaceInteractionPatch = {
  isFavorite?: boolean;
  isVisited?: boolean;
};

/** `setInteraction`'s answer (an error message, or null) as a toggle result. */
export const toToggleResult = (error: string | null): ToggleCommitResult =>
  error === null ? { ok: true } : { ok: false, message: error };

/**
 * Love and Visited on a place (X24), for the place page and the map drawer
 * alike: each flips on the tap, writes through `recordPlaceInteraction`, and
 * settles on what the refetched interaction then says. Success needs no
 * toast — the control already changed; a refusal puts it back and says so.
 *
 * One exception (X08/D27): the first visit also takes the place off Want to
 * try (the server does it — `UserActor.recordPlaceInteraction`), which no
 * control on screen showed. Once that write is confirmed the map's pins are
 * told (`announceWantToTry`) and a toast says so, rather than letting the
 * bookmark empty silently.
 */
export function usePlaceToggles({
  placeId,
  loved,
  visited,
  wantToTry,
  setInteraction,
}: {
  placeId: string | undefined;
  loved: boolean;
  visited: boolean;
  /** The place is on the viewer's Want to try list (`want_to_visit`). */
  wantToTry: boolean;
  /** Resolves to an error message, or null on success. */
  setInteraction: (patch: PlaceInteractionPatch) => Promise<string | null>;
}): { love: OptimisticToggle; visit: OptimisticToggle } {
  const commitLove = useCallback(
    async (next: boolean) =>
      toToggleResult(await setInteraction({ isFavorite: next })),
    [setInteraction],
  );
  const commitVisit = useCallback(
    async (next: boolean) => {
      const result = toToggleResult(await setInteraction({ isVisited: next }));
      if (result.ok && next && wantToTry && placeId !== undefined) {
        announceWantToTry({ kind: "PLACE", placeId }, false);
        const toast = visitToastText(true, true);
        notify(toast.message, {
          tone: "success",
          description: toast.description,
        });
      }
      return result;
    },
    [setInteraction, wantToTry, placeId],
  );
  const love = useOptimisticToggle({
    value: loved,
    commit: commitLove,
    onError: (message) =>
      notify("Couldn't update Love", { tone: "error", description: message }),
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
  return { love, visit };
}
