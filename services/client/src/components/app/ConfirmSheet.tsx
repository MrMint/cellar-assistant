"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Delete } from "./icons";
import { pressFeedback } from "./overlays/press";
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
 * The confirm for an action Undo cannot bring back (KIT § 4 "Toast or
 * confirm": deleting a bottle with its rating, note and history; deleting a
 * list). Everything else acts at once with `notify(…, { undo })`.
 *
 * KIT § 2 Buttons and CROSS-LOT "Delete confirm": destructive is never first
 * or primary — "Keep it" (outlined secondary) comes first, and the verb is
 * outlined in danger with the trash glyph beside it. Two equal buttons side by
 * side, in a sheet on a phone and a 440 dialog on desktop.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep it",
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
        <div className="grid w-full grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={pending}
            {...pressFeedback()}
            onClick={() => onOpenChange(false)}
            className="t-head h-11 border-edge-2 bg-transparent text-ink hover:bg-raised dark:border-edge-2 dark:bg-transparent"
          >
            {cancelLabel}
          </Button>
          <Button
            variant="outline"
            data-tone="danger"
            disabled={pending}
            {...pressFeedback()}
            onClick={onConfirm}
            className="t-head h-11 border-danger bg-transparent text-danger hover:bg-raised hover:text-danger focus-visible:ring-danger/40 dark:border-danger dark:bg-transparent"
          >
            {pending ? <Spinner aria-hidden /> : <Delete aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children}
    </ResponsiveDialog>
  );
}
