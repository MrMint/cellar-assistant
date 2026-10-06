"use client";

import {
  Alert,
  Button,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { useRef, useState } from "react";
import { MdPhotoLibrary } from "react-icons/md";
import { describeUploadBlockers } from "@/lib/api/files";
import { dataUrlToFile } from "@/lib/items/data-url";
import { CameraCapture } from "../common/CameraCapture";

export type AddPhotoProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (image: File) => Promise<void>;
};

/**
 * `82450ad1:src/components/item/AddPhoto.tsx`, restored: the "Set a new
 * display image" modal around the live `CameraCapture` viewfinder
 * (react-webcam), as the old one was.
 *
 * Two substitutions:
 *
 * - The old modal handed `CameraCapture`'s base64 data URL to a server
 *   action. Uploads now go browser → presigned PUT → `verifyUpload`
 *   (`lib/api/files.ts`), which wants a `File`, so the capture is decoded in
 *   the browser (`lib/items/data-url`) and never leaves it as base64.
 * - Under the viewfinder there is a file input, which the old modal did not
 *   have: a desktop with no webcam, or a camera permission refused, would
 *   otherwise leave the dialog spinning with no way to set a photo. The
 *   upload's error, which the old modal dropped, is shown.
 */
export const AddPhotoModal = ({ open, onClose, onCapture }: AddPhotoProps) => {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockers = describeUploadBlockers();

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await onCapture(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const onCameraCapture = (dataUrl: string) => {
    if (busy) return;
    const file = dataUrlToFile(dataUrl, `display-${Date.now()}.jpg`);
    if (file === null) {
      setError("The camera returned no picture. Try again.");
      return;
    }
    void upload(file);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Set a new display image</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {blockers.length === 0 && (
              <CameraCapture onCapture={onCameraCapture} />
            )}
            {busy && <LinearProgress />}
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<MdPhotoLibrary />}
              loading={busy}
              disabled={blockers.length > 0}
              onClick={() => input.current?.click()}
            >
              Choose a photo
            </Button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file !== undefined) void upload(file);
              }}
            />
            {blockers.map((blocker) => (
              <Typography key={blocker} level="body-xs" color="warning">
                {blocker}
              </Typography>
            ))}
            {error !== null && (
              <Alert size="sm" color="danger" variant="soft">
                {error}
              </Alert>
            )}
          </Stack>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
};
