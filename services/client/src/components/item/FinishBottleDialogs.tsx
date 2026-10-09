"use client";

import { useEffect, useId, useRef } from "react";
import { dismissNotification, notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { finishToastCopy } from "./finish-bottle";
import { LoadingButton } from "./LoadingButton";
import type { FinishBottle } from "./useFinishBottle";

/**
 * N13a's markup over `useFinishBottle`: the "Finished it?" question as an
 * N27 sheet (`ResponsiveDialog` — a bottom sheet on phones, a dialog from
 * `md`) and the Undo toast through `notify()` and the app's one
 * `<Toaster/>`, which already sits above the tab bar (obs 41).
 *
 * The reducer hears when the toast closes on its own or is swiped away
 * (`onAutoClose` / `onClose` → DISMISS: the Undo window is over). The same
 * toast (one id per bottle) turns into "Putting it back…" while Undo runs
 * (`tone: "loading"`), into the refusal with "Try again" if Undo fails, and
 * goes away once it worked.
 */
export function FinishBottleDialogs({
  finish,
  itemName,
}: {
  finish: FinishBottle;
  itemName: string | undefined;
}) {
  const { state } = finish;
  const asking =
    state.phase === "confirming" ||
    (state.phase === "finishing" && state.asked);
  const name =
    itemName === undefined || itemName === "" ? "This bottle" : itemName;

  useFinishToast(finish);

  return (
    <ResponsiveDialog
      role="alertdialog"
      open={asking}
      onOpenChange={(open) => {
        if (!open && state.phase === "confirming") finish.cancel();
      }}
      title="Finished it?"
      description={`${name} leaves the cellar. Its check-ins stay, and you can undo this.`}
      dismissible={state.phase === "confirming"}
      footer={
        <div className="flex w-full flex-col gap-2 md:flex-row-reverse md:justify-start">
          <LoadingButton
            loading={state.phase === "finishing"}
            onClick={finish.confirm}
          >
            Finished
          </LoadingButton>
          <Button
            variant="ghost"
            disabled={state.phase === "finishing"}
            onClick={finish.cancel}
          >
            Not yet
          </Button>
        </div>
      }
    />
  );
}

/**
 * N13a's Undo toast alone, for a surface that asks "Finished?" its own way —
 * the Pour sheet asks inside itself after the last pour (X03), then calls
 * `finish.finishNow`. The same toast as the slider's: "Finished. Moved out of
 * the cellar." with Undo, "Putting it back…", the refusal with "Try again".
 */
export function useFinishToast(finish: FinishBottle): void {
  const { state } = finish;
  const toastId = useId();
  // The toast's callbacks outlive the render that raised them: read the
  // hook's current commands, whose phase checks are then up to date.
  const latest = useRef(finish);
  useEffect(() => {
    latest.current = finish;
  });
  const previous = useRef(state.phase);

  useEffect(() => {
    const was = previous.current;
    previous.current = state.phase;
    const message = finishToastCopy(state);
    const closed = {
      // The window passed, or the toast was swiped away: no Undo any more.
      onAutoClose: () => latest.current.dismiss(),
      onClose: () => latest.current.dismiss(),
    };
    // Keep the toast when its action runs: it shows the Undo running, then
    // its outcome.
    const undo = () => latest.current.undo();
    if (state.phase === "finished" && message !== null) {
      notify(message, { id: toastId, undo, keepOnAction: true, ...closed });
    } else if (state.phase === "undoing" && message !== null) {
      notify(message, { id: toastId, tone: "loading" });
    } else if (state.phase === "undoFailed" && message !== null) {
      notify(message, {
        id: toastId,
        tone: "error",
        undo,
        actionLabel: "Try again",
        keepOnAction: true,
        ...closed,
      });
    } else if (state.phase === "idle" && was === "undoing") {
      dismissNotification(toastId);
    }
  }, [state, toastId]);

  // Leaving the page takes the toast with it: its Undo would act on a bottle
  // no longer on screen.
  useEffect(() => () => dismissNotification(toastId), [toastId]);
}
