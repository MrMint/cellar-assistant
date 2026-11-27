"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { BottomSheet, type BottomSheetProps } from "./BottomSheet";
import { useOverlayLayer } from "./overlays/layers";
import { keepOpenForToasts } from "./toastLayer";
import { useReturnFocus } from "./useReturnFocus";

export type ResponsiveDialogProps = Pick<
  BottomSheetProps,
  | "open"
  | "onOpenChange"
  | "title"
  | "hideTitle"
  | "description"
  | "dismissible"
  | "footer"
  | "className"
  | "children"
> & {
  /** Assistive tech hears an alert dialog (confirms). */
  role?: "dialog" | "alertdialog";
};

/**
 * One API for every modal (the 13 Joy `Modal` sites): a `BottomSheet` below
 * `md`, a centred `ui/dialog` from `md` up. Before hydration it renders the
 * sheet, which is what a phone — the first target — wants anyway.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  dismissible = true,
  footer,
  className,
  children,
  role = "dialog",
}: ResponsiveDialogProps) {
  const desktop = useMediaQuery(breakpointUp("md"));
  const returnFocus = useReturnFocus(open && desktop);
  // KIT § 4: back closes the dialog on top (Radix answers its own Escape).
  // Below md the BottomSheet registers itself.
  useOverlayLayer(open && desktop, () => {
    if (dismissible) onOpenChange(false);
  });

  if (!desktop) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        hideTitle={hideTitle}
        description={description}
        dismissible={dismissible}
        role={role}
        footer={footer}
        className={className}
      >
        {children}
      </BottomSheet>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || dismissible) onOpenChange(next);
      }}
    >
      <DialogContent
        role={role}
        showCloseButton={dismissible}
        onCloseAutoFocus={returnFocus}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onInteractOutside={keepOpenForToasts}
        className={cn(
          // Capped and scrolling, as Joy's ModalDialog was: ui/dialog has no
          // height limit, so a long body ran off the viewport from md up.
          // KIT § 3 Desktop: a 440 dialog, centred on the content column
          // (beside the 88 rail, `ui/dialog`), r16, sh-dlg.
          "max-h-[85dvh] gap-4 overflow-y-auto p-6",
          className,
        )}
      >
        <DialogHeader className={cn(hideTitle && "sr-only")}>
          <DialogTitle className="t-title text-ink">{title}</DialogTitle>
          {description !== undefined ? (
            <DialogDescription className="t-body text-ink-2">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only" />
          )}
        </DialogHeader>
        <div className="min-h-0">{children}</div>
        {footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
