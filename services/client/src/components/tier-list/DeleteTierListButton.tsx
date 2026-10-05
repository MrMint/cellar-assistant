"use client";

import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Modal,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { MdDeleteOutline } from "react-icons/md";
import { useMutation } from "urql";
import { ApiError } from "@/components/cellar-api/ApiError";
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
      <Button
        variant="outlined"
        color="danger"
        startDecorator={<MdDeleteOutline />}
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog variant="outlined" role="alertdialog">
          <DialogTitle>Delete this tier list?</DialogTitle>
          <Divider />
          <DialogContent>
            <Typography level="body-sm">
              <strong>{name}</strong> and its {itemCount}{" "}
              {itemCount === 1 ? "entry" : "entries"} will be deleted. The items
              and places themselves are not touched — only their place on this
              list. This cannot be undone.
            </Typography>
            {error !== null && <ApiError error={error} />}
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              loading={fetching}
              onClick={confirm}
            >
              Delete
            </Button>
            <Button
              variant="plain"
              color="neutral"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </>
  );
}
