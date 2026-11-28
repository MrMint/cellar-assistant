import { type ExternalToast, toast } from "sonner";
import { feedback } from "@/lib/feedback";
import { toastMs } from "@/lib/motion";

/** How long a toast with Undo stays (SPEC movement 25): five seconds. */
export const UNDO_TOAST_MS = toastMs;

export type NotifyOptions = {
  /** Offers Undo; the toast then lives `UNDO_TOAST_MS`. */
  undo?: () => void;
  /** The `undo` action's label, when it is not "Undo" ("Try again"). */
  actionLabel?: string;
  /**
   * Keep the toast up when its action runs, because the caller goes on to
   * update it in place (`id`) with the action's progress and outcome.
   */
  keepOnAction?: boolean;
  description?: string;
  /** `loading` shows a spinner and never times out; update it by `id`. */
  tone?: "default" | "success" | "error" | "loading";
  /** Replace an earlier toast with the same id instead of stacking. */
  id?: string | number;
  /** The toast closed by itself: its time ran out. */
  onAutoClose?: () => void;
  /** The toast was closed by the person (swiped away, or dismissed). */
  onClose?: () => void;
  /**
   * How long it stays, when the default (`UNDO_TOAST_MS` with an action) is
   * too short for what it offers — a finished background read (X05) is
   * news worth more than five seconds.
   */
  durationMs?: number;
};

/**
 * Raise a toast through the app's one `<Toaster/>`. Reversible actions
 * (remove from cellar, unlove, delete a log) call this with `undo` instead of
 * asking first (design §4.7):
 *
 *   notify("Removed from Garage", { undo: () => restore(item) })
 *
 * Returns the toast id (pass it back as `id` to update the same toast). A
 * toast that follows an operation through its phases — "Finished · Undo",
 * then "Putting it back…" (`tone: "loading"`), then the refusal with "Try
 * again" (`actionLabel`, `keepOnAction`) — reuses one `id`, and an update
 * without `undo` drops the earlier action.
 */
export function notify(
  message: string,
  {
    undo,
    actionLabel = "Undo",
    keepOnAction = false,
    description,
    tone = "default",
    id,
    onAutoClose,
    onClose,
    durationMs,
  }: NotifyOptions = {},
): string | number {
  seq += 1;
  const toastId = id ?? `notify-${seq}`;
  const options: ExternalToast = {
    id: toastId,
    description,
    // Explicitly undefined without `undo`: updating a toast by id merges, so
    // a leftover Undo would otherwise survive into the next phase.
    action:
      undo === undefined
        ? undefined
        : {
            label: actionLabel,
            onClick: (event) => {
              if (keepOnAction) event.preventDefault();
              // KIT § 2: the undo haptic, inside the tap that asked for it.
              if (actionLabel === "Undo") feedback("undo");
              undo();
            },
          },
    ...(undo === undefined || tone === "loading"
      ? {}
      : { duration: UNDO_TOAST_MS }),
    ...(durationMs === undefined || tone === "loading"
      ? {}
      : { duration: durationMs }),
    onAutoClose: () => {
      forget(toastId);
      onAutoClose?.();
    },
    onDismiss: () => {
      forget(toastId);
      onClose?.();
    },
  };
  const raised =
    tone === "success"
      ? toast.success(message, options)
      : tone === "error"
        ? toast.error(message, options)
        : tone === "loading"
          ? toast.loading(message, options)
          : toast(message, options);
  if (tone !== "loading") {
    current = {
      id: raised,
      message,
      tone,
      options,
      durationMs: options.duration ?? DEFAULT_TOAST_MS,
      shownAt: Date.now(),
    };
  }
  if (pauses > 0) holdCurrent();
  return raised;
}

/** sonner's own default, for a toast raised without a duration. */
const DEFAULT_TOAST_MS = 4000;

/**
 * The one toast up (KIT § 2: one at a time; the Toaster shows one), kept so a
 * quick look can pause it and hand back the time it had left.
 */
let current: {
  id: string | number;
  message: string;
  tone: "default" | "success" | "error";
  options: ExternalToast;
  durationMs: number;
  shownAt: number;
  /** Set while paused: what was left when it stopped. */
  leftMs?: number;
} | null = null;
let pauses = 0;
let seq = 0;

const forget = (id: string | number): void => {
  if (current?.id === id) current = null;
};

const reraise = (duration: number): void => {
  if (current === null) return;
  const options = { ...current.options, id: current.id, duration };
  if (current.tone === "success") toast.success(current.message, options);
  else if (current.tone === "error") toast.error(current.message, options);
  else toast(current.message, options);
};

const holdCurrent = (): void => {
  if (current === null || current.leftMs !== undefined) return;
  const elapsed = Date.now() - current.shownAt;
  current.leftMs = Math.max(0, current.durationMs - elapsed);
  reraise(Number.POSITIVE_INFINITY);
};

/**
 * KIT § 2: a toast pauses while a quick look is open. Call on open; the
 * returned function resumes it with the time it had left. Pauses nest.
 */
export function pauseToasts(): () => void {
  pauses += 1;
  holdCurrent();
  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;
    pauses = Math.max(0, pauses - 1);
    if (pauses > 0 || current === null || current.leftMs === undefined) return;
    const left = current.leftMs;
    current.leftMs = undefined;
    current.durationMs = left;
    current.shownAt = Date.now();
    reraise(left);
  };
}

/** Take a toast raised by `notify` down (leaving a page, an operation done). */
export function dismissNotification(id: string | number): void {
  if (current?.id === id) current = null;
  toast.dismiss(id);
}
