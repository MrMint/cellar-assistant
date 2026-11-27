"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { Delete, ICON_STROKE } from "@/components/app/icons";
import { FieldError } from "@/components/app/parts/Field";
import { useNavigate } from "@/components/app/useNavigate";
import { Button } from "@/components/ui/button";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { kindNoun } from "./lists/model";
import { DeleteTierListMutation } from "./queries";

/**
 * "Delete this list" at the foot of List details (Social-Lists 08, 10): a
 * quiet danger row with the trash glyph, then the kit's confirm. Deleting a
 * list is the one thing Undo cannot bring back (KIT § 4), so it confirms.
 *
 * `TierListActor.delete` cascades to the entries (B7), and the confirm says
 * so in the person's terms. Only the list's maker is ever shown this: the
 * edit page and `ListDetailsSheet` check before they draw it, and the API
 * refuses anyone else, which the confirm then says above its buttons.
 */
export function DeleteTierListButton({
  tierListId,
  name,
  itemCount,
  listType = "",
  onDeleted,
}: {
  tierListId: string;
  name: string;
  itemCount: number;
  /** For the count's noun ("113 places"); entries without it. */
  listType?: string;
  /** Before the move to `/tier-lists` (a sheet closes itself here). */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [{ fetching }, deleteTierList] = useMutation(DeleteTierListMutation);

  const confirm = useCallback(async () => {
    setError(null);
    const response = await deleteTierList({ id: tierListId });
    const result = unwrapResult(
      response.data?.deleteTierList ?? undefined,
      "DeletedTierList",
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    onDeleted?.();
    navigate.push("/tier-lists");
    router.refresh();
  }, [deleteTierList, navigate, onDeleted, router, tierListId]);

  return (
    <>
      <Button
        variant="ghost"
        className="h-11 justify-start gap-4 px-1 text-danger"
        onClick={() => setOpen(true)}
      >
        <Delete aria-hidden strokeWidth={ICON_STROKE} />
        Delete this list
      </Button>
      <ConfirmSheet
        open={open}
        onOpenChange={(next) => {
          if (!fetching) setOpen(next);
        }}
        title="Delete this list?"
        description={
          <>
            <strong className="text-ink">{name}</strong> and its{" "}
            {kindNoun(listType, itemCount)} go. The drinks and places stay.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => void confirm()}
        pending={fetching}
      >
        {error !== null && <FieldError>{error.message}</FieldError>}
      </ConfirmSheet>
    </>
  );
}
