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
  const name = itemName === undefined || itemName === "" ? "this" : itemName;

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
          layout="center"
          sx={{ maxWidth: 400, width: "calc(100% - 32px)" }}
        >
          <DialogTitle id="finish-bottle-title">Finished it?</DialogTitle>
          <DialogContent>
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
        open={state.phase === "finished" || state.phase === "undoing"}
        autoHideDuration={state.phase === "finished" ? UNDO_WINDOW_MS : null}
        onClose={(_event, reason) => {
          // A tap elsewhere is not a decision; only the timer closes it.
          if (reason === "clickaway") return;
          finish.dismiss();
        }}
        variant="soft"
        color="neutral"
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
            loading={state.phase === "undoing"}
            onClick={finish.undo}
          >
            Undo
          </Button>
        }
      >
        <Typography level="body-sm">
          Finished. Moved out of the cellar.
        </Typography>
      </Snackbar>
    </>
  );
}
