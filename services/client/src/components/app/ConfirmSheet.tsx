"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ResponsiveDialog } from "./ResponsiveDialog";

export type ConfirmSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question: "Delete this cellar?" */
  title: string;
  /** What happens, in words: "Its 12 bottles go with it." */
  description?: ReactNode;
  /** The verb on the button: "Delete". */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** While the action runs: the button spins and nothing can be dismissed. */
  pending?: boolean;
  /**
   * A block between the words and the buttons — a server refusal
   * (`ApiError`), say, which is a block and so cannot sit inside the
   * description's paragraph.
   */
  children?: ReactNode;
};

/**
 * The confirm for an action that cannot be undone. Reversible actions don't
 * get one — they get `notify(…, { undo })` (design §4.7).
 *
 * The only place a **solid** danger button is allowed (design §3.1); its ink
 * is the page background, never white. Cancel comes first in reading order
 * and is the larger target on a phone, where the sheet stacks them.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  pending = false,
  children,
}: ConfirmSheetProps) {
  return (
    <ResponsiveDialog
      role="alertdialog"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible={!pending}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            data-tone="danger"
            disabled={pending}
            onClick={onConfirm}
            className="bg-destructive text-background hover:bg-destructive/90 focus-visible:ring-destructive/40"
          >
            {pending && <Spinner aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children}
    </ResponsiveDialog>
  );
}
