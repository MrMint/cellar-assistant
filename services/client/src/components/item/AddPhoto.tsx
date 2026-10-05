"use client";

import {
  Alert,
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { useRef, useState } from "react";
import { MdCameraAlt } from "react-icons/md";
import { describeUploadBlockers } from "@/lib/api/files";

export type AddPhotoProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (image: File) => Promise<void>;
};

/**
 * `82450ad1:src/components/item/AddPhoto.tsx`, restored with one substitution:
 * the old modal mounted `CameraCapture` (react-webcam) and produced a base64
 * data URL for a server action to upload. Uploads now go browser → presigned
 * PUT → `verifyUpload` (`lib/api/files.ts`), which wants a `File`, so the
 * dialog offers a file input with `capture="environment"` — on a phone that
 * opens the rear camera directly, the same thing the old live viewfinder did.
 * The camera component itself belongs to the onboarding wave.
 */
export const AddPhotoModal = ({ open, onClose, onCapture }: AddPhotoProps) => {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockers = describeUploadBlockers();

  const onPick = async (file: File) => {
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

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Set a new display image</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Button
              startDecorator={<MdCameraAlt />}
              loading={busy}
              disabled={blockers.length > 0}
              onClick={() => input.current?.click()}
            >
              Take or choose a photo
            </Button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file !== undefined) void onPick(file);
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
