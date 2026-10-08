"use client";

import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { UNDO_TOAST_MS } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { finishToastCopy } from "./finish-bottle";
import { LoadingButton } from "./LoadingButton";
import type { FinishBottle } from "./useFinishBottle";

/**
 * N13a's markup over `useFinishBottle`: the "Finished it?" question as an
 * N27 sheet (`ResponsiveDialog` — a bottom sheet on phones, a dialog from
 * `md`) and the Undo toast through the app's one Sonner `<Toaster/>`, which
 * already sits above the tab bar (obs 41).
 *
 * The toast is raised with Sonner's `toast` rather than `notify()`, because
 * the reducer must hear when it closes on its own (`onAutoClose` → DISMISS:
 * the Undo window is over) and `notify` passes no close callback; its copy,
 * duration (`UNDO_TOAST_MS`) and Undo action are `notify`'s. The same toast
 * (one id per bottle) turns into "Putting it back…" while Undo runs, into
 * the refusal with "Try again" if Undo fails, and goes away once it worked.
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
      onDismiss: () => latest.current.dismiss(),
    };
    if (state.phase === "finished" && message !== null) {
      toast(message, {
        id: toastId,
        duration: UNDO_TOAST_MS,
        ...closed,
        action: {
          label: "Undo",
          onClick: (event) => {
            // Keep the toast: it shows the Undo running, then its outcome.
            event.preventDefault();
            latest.current.undo();
          },
        },
      });
    } else if (state.phase === "undoing" && message !== null) {
      toast.loading(message, { id: toastId, action: undefined });
    } else if (state.phase === "undoFailed" && message !== null) {
      toast.error(message, {
        id: toastId,
        duration: UNDO_TOAST_MS,
        ...closed,
        action: {
          label: "Try again",
          onClick: (event) => {
            event.preventDefault();
            latest.current.undo();
          },
        },
      });
    } else if (state.phase === "idle" && was === "undoing") {
      toast.dismiss(toastId);
    }
  }, [state, toastId]);

  // Leaving the page takes the toast with it: its Undo would act on a bottle
  // no longer on screen.
  useEffect(() => () => void toast.dismiss(toastId), [toastId]);

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
