import { type ExternalToast, toast } from "sonner";

/** How long a toast with Undo stays (design §4.6): five seconds. */
export const UNDO_TOAST_MS = 5000;

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
  }: NotifyOptions = {},
): string | number {
  const options: ExternalToast = {
    id,
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
              undo();
            },
          },
    ...(undo === undefined || tone === "loading"
      ? {}
      : { duration: UNDO_TOAST_MS }),
    ...(onAutoClose === undefined ? {} : { onAutoClose: () => onAutoClose() }),
    ...(onClose === undefined ? {} : { onDismiss: () => onClose() }),
  };
  if (tone === "success") return toast.success(message, options);
  if (tone === "error") return toast.error(message, options);
  if (tone === "loading") return toast.loading(message, options);
  return toast(message, options);
}

/** Take a toast raised by `notify` down (leaving a page, an operation done). */
export function dismissNotification(id: string | number): void {
  toast.dismiss(id);
}
