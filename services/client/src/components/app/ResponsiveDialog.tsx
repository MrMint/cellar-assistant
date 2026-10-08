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
        className={cn(
          "surface-glass gap-4 rounded-lg border-none p-6 text-foreground",
          className,
        )}
      >
        <DialogHeader className={cn(hideTitle && "sr-only")}>
          <DialogTitle className="type-title-2">{title}</DialogTitle>
          {description !== undefined ? (
            <DialogDescription className="type-callout text-ink-2">
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
