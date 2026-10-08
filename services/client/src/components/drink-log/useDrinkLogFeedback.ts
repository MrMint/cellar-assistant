"use client";

import { useCallback } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { unwrapResult } from "@/lib/api/result";
import type { LogDrinkSheetProps } from "./LogDrinkSheet";
import { DeleteDrinkLogMutation } from "./queries";

type Saved = Parameters<NonNullable<LogDrinkSheetProps["onSaved"]>>[0];

/** "Logged Barolo" / "Logged Barolo for 3" — the toast after a new log. */
export const loggedMessage = (
  itemName: string,
  drinkerCount: number,
): string =>
  drinkerCount > 1
    ? `Logged ${itemName} for ${drinkerCount}`
    : `Logged ${itemName}`;

/**
 * What happens after the sheet saves: the caller refreshes, and a new log
 * toasts with **Undo** (design §4.6 — a reversible action does not confirm).
 * Undo is `deleteDrinkLog` on the id the sheet minted, which also takes the
 * companions' entries written with it.
 */
export function useDrinkLogFeedback({
  itemName,
  onChanged,
}: {
  itemName: string;
  onChanged?: () => void;
}): (saved: Saved) => void {
  const [, deleteDrinkLog] = useMutation(DeleteDrinkLogMutation);

  return useCallback(
    (saved: Saved) => {
      onChanged?.();
      if (saved.kind === "edit") {
        notify("Log updated", { tone: "success" });
        return;
      }
      notify(loggedMessage(itemName, saved.drinkerCount), {
        tone: "success",
        undo: () => {
          void (async () => {
            const result = unwrapResult(
              (await deleteDrinkLog({ id: saved.entryId })).data
                ?.deleteDrinkLog,
              "DeletedDrinkLogPayload",
            );
            if (!result.ok) {
              notify("Couldn't undo that log", {
                tone: "error",
                description: result.error.message,
              });
              return;
            }
            notify("Log removed");
            onChanged?.();
          })();
        },
      });
    },
    [deleteDrinkLog, itemName, onChanged],
  );
}
