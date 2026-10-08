"use client";

import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Snackbar,
  Typography,
} from "@mui/joy";
import { UNDO_WINDOW_MS } from "./finish-bottle";
import type { FinishBottle } from "./useFinishBottle";

/**
 * N13a's markup: the "Finished it?" question and the Undo toast. Minimal Joy
 * on purpose — the shadcn migration (D20) replaces this file with a Drawer
 * and a Sonner toast over the same `useFinishBottle` API.
 *
 * The toast sits above the phone tab bar (the review's observation 41: the
 * old toasts covered the navigation).
 */
export function FinishBottleDialogs({
  finish,
  itemName,
}: {
  finish: FinishBottle;
  itemName: string | undefined;
}) {
  const { state } = finish;
  const asking =
    state.phase === "confirming" ||
    (state.phase === "finishing" && state.asked);
  const undoFailed = state.phase === "undoFailed";
  const toastOpen =
    state.phase === "finished" || state.phase === "undoing" || undoFailed;
  const name =
    itemName === undefined || itemName === "" ? "This bottle" : itemName;

  return (
    <>
      <Modal
        open={asking}
        onClose={() => {
          if (state.phase === "confirming") finish.cancel();
        }}
      >
        <ModalDialog
          role="alertdialog"
          aria-labelledby="finish-bottle-title"
          aria-describedby="finish-bottle-body"
          layout="center"
          sx={{ maxWidth: 400, width: "calc(100% - 32px)" }}
        >
          <DialogTitle id="finish-bottle-title">Finished it?</DialogTitle>
          <DialogContent id="finish-bottle-body">
            {`${name} leaves the cellar. Its check-ins stay, and you can undo this.`}
          </DialogContent>
          <DialogActions>
            <Button
              loading={state.phase === "finishing"}
              onClick={finish.confirm}
            >
              Finished
            </Button>
            <Button
              variant="plain"
              color="neutral"
              disabled={state.phase === "finishing"}
              onClick={finish.cancel}
            >
              Not yet
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
      <Snackbar
        open={toastOpen}
        // Announced, not just shown: Joy's root is role="presentation".
        role="status"
        aria-live="polite"
        autoHideDuration={state.phase === "undoing" ? null : UNDO_WINDOW_MS}
        onClose={(_event, reason) => {
          // A tap elsewhere is not a decision; only the timer closes it.
          if (reason === "clickaway") return;
          finish.dismiss();
        }}
        variant="soft"
        color={undoFailed ? "danger" : "neutral"}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{
          bottom: {
            xs: "calc(72px + env(safe-area-inset-bottom))",
            sm: "16px",
          },
        }}
        endDecorator={
          <Button
            size="sm"
            variant="plain"
            color={undoFailed ? "danger" : "primary"}
            loading={state.phase === "undoing"}
            onClick={finish.undo}
          >
            {undoFailed ? "Try again" : "Undo"}
          </Button>
        }
      >
        <Typography level="body-sm">
          {state.phase === "undoFailed"
            ? `Couldn't undo: ${state.error}`
            : "Finished. Moved out of the cellar."}
        </Typography>
      </Snackbar>
    </>
  );
}
