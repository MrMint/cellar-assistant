"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { Delete, ICON_STROKE } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { DeleteTierListMutation } from "./queries";

/**
 * **New-only, kept** (decision 2; the old app had no delete UI): shown under
 * the restored edit form.
 *
 * Delete, with the cascade said out loud.
 *
 * `TierListActor.delete` **cascades** — B7 chose that deliberately, and
 * deliberately unlike `CellarActor.delete`, which refuses a non-empty cellar
 * and makes the viewer empty it first. Two adjacent aggregates with opposite
 * delete semantics is exactly the situation where a dialog that says "are you
 * sure?" and nothing else gets someone's list of forty bars.
 *
 * The confirm is the app's `ConfirmSheet` (the one place solid danger lives);
 * the API's refusal, when there is one, is said inside it, above its buttons.
 */
export function DeleteTierListButton({
  tierListId,
  name,
  itemCount,
}: {
  tierListId: string;
  name: string;
  itemCount: number;
}) {
  const router = useRouter();
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
    router.push("/tier-lists");
    router.refresh();
  }, [deleteTierList, router, tierListId]);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Delete aria-hidden strokeWidth={ICON_STROKE} />
        Delete
      </Button>
      <ConfirmSheet
        open={open}
        onOpenChange={(next) => {
          if (!fetching) setOpen(next);
        }}
        title="Delete this tier list?"
        description={
          <>
            <strong>{name}</strong> and its {itemCount}{" "}
            {itemCount === 1 ? "entry" : "entries"} will be deleted. The items
            and places themselves are not touched — only their place on this
            list. This cannot be undone.
            {error !== null && (
              <span role="alert" className="mt-2 block text-destructive">
                {error.message}
              </span>
            )}
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => void confirm()}
        pending={fetching}
      />
    </>
  );
}
