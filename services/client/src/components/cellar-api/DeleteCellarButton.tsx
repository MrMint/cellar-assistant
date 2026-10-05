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
import { MdDeleteOutline, MdWarningAmber } from "react-icons/md";
import { useMutation } from "urql";
import { DeleteCellarMutation } from "@/lib/api/cellars";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { ApiError } from "./ApiError";

/**
 * Delete, with the one refusal the schema promises made visible up front:
 * `deleteCellar` is a `ConflictError` while the cellar still holds bottles.
 *
 * The count is from the last render and can be stale, so the button is only
 * *disabled* by it — the real answer still comes from the server, and its
 * message is shown when it disagrees.
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
        variant="soft"
        color="danger"
        startDecorator={<MdDeleteOutline />}
        disabled={blocked || fetching}
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      {blocked && (
        <Typography level="body-xs" textColor="text.tertiary" sx={{ ml: 1 }}>
          Empty the cellar first.
        </Typography>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog variant="outlined" role="alertdialog">
          <DialogTitle>
            <MdWarningAmber />
            Delete this cellar?
          </DialogTitle>
          <Divider />
          <DialogContent>
            <Typography level="body-sm">
              “{cellarName}” and its check-in history go for good. This cannot
              be undone.
            </Typography>
            {error !== null && <ApiError error={error} />}
          </DialogContent>
          <DialogActions>
            <Button
              color="danger"
              loading={fetching}
              onClick={() => void confirm()}
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
