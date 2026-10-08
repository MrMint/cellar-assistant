"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { Delete } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { DeleteCellarMutation } from "@/lib/api/cellars";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";

/**
 * Delete, with the one refusal the schema promises made visible up front:
 * `deleteCellar` is a `ConflictError` while the cellar still holds bottles.
 *
 * The count is from the last render and can be stale, so the button is only
 * *disabled* by it — the real answer still comes from the server, and its
 * message is shown in the confirm when it disagrees.
 *
 * The confirm is a `ConfirmSheet` (a sheet on phones, a dialog from `md`):
 * deleting a cellar cannot be undone, so it is the one place a solid danger
 * button belongs.
 */
export function DeleteCellarButton({
  cellarId,
  cellarName,
  itemCount,
}: {
  cellarId: string;
  cellarName: string;
  itemCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [{ fetching }, deleteCellar] = useMutation(DeleteCellarMutation);

  const confirm = useCallback(async () => {
    setError(null);
    const response = await deleteCellar({ cellarId });
    const result = unwrapResult(
      response.data?.deleteCellar ?? undefined,
      "DeletedCellar",
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push("/cellars");
    router.refresh();
  }, [cellarId, deleteCellar, router]);

  const blocked = itemCount > 0;

  return (
    <>
      <Button
        variant="destructive"
        disabled={blocked || fetching}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Delete />
        Delete
      </Button>
      {blocked && (
        <span className="type-footnote ml-2">Empty the cellar first.</span>
      )}

      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title="Delete this cellar?"
        description={
          <>
            “{cellarName}” and its check-in history go for good. This cannot be
            undone.
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
