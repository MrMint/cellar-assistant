/**
 * Toasts over an open modal. A Radix/vaul modal (`BottomSheet`, the desktop
 * `ui/dialog`) sets `pointer-events: none` on `body` and dismisses on any
 * pointer-down outside its content — and the Toaster is outside it. So an
 * Undo toast raised while a sheet stays open (the Pour sheet's "Finished."
 * and "Moved to …" toasts) could not be tapped: the tap fell through to
 * whatever button of the sheet sat under the toast.
 *
 * `TOASTER_CLASS` takes the toasts back from `body`'s `pointer-events: none`;
 * `keepOpenForToasts` is every modal's `onInteractOutside`, so tapping a
 * toast neither closes the modal nor counts as leaving it.
 */
export const TOASTER_SELECTOR = "[data-sonner-toaster]";

export const TOASTER_CLASS = "pointer-events-auto";

export function isInToaster(target: EventTarget | null): boolean {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    target.closest(TOASTER_SELECTOR) !== null
  );
}

export function keepOpenForToasts(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}): void {
  if (isInToaster(event.target)) event.preventDefault();
}
