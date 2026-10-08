import { type ExternalToast, toast } from "sonner";

/** How long a toast with Undo stays (design §4.6): five seconds. */
export const UNDO_TOAST_MS = 5000;

export type NotifyOptions = {
  /** Offers Undo; the toast then lives `UNDO_TOAST_MS`. */
  undo?: () => void;
  description?: string;
  tone?: "default" | "success" | "error";
  /** Replace an earlier toast with the same id instead of stacking. */
  id?: string | number;
};

/**
 * Raise a toast through the app's one `<Toaster/>`. Reversible actions
 * (remove from cellar, unlove, delete a log) call this with `undo` instead of
 * asking first (design §4.7):
 *
 *   notify("Removed from Garage", { undo: () => restore(item) })
 *
 * Returns the toast id (pass it back as `id` to update the same toast).
 */
export function notify(
  message: string,
  { undo, description, tone = "default", id }: NotifyOptions = {},
): string | number {
  const options: ExternalToast = {
    id,
    description,
    ...(undo === undefined
      ? {}
      : {
          duration: UNDO_TOAST_MS,
          action: { label: "Undo", onClick: () => undo() },
        }),
  };
  if (tone === "success") return toast.success(message, options);
  if (tone === "error") return toast.error(message, options);
  return toast(message, options);
}
