"use client";

import { useRef, useState } from "react";
import { PhotoLibrary, Warning } from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeUploadBlockers } from "@/lib/api/files";
import { dataUrlToFile } from "@/lib/items/data-url";
import { CameraCapture } from "../common/CameraCapture";
import { LoadingButton } from "./LoadingButton";

/** The dialog's title, as the old modal had it. */
const TITLE = "Set a new display image";

export type AddPhotoProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (image: File) => Promise<void>;
  /** The dialog's title; the display-image one by default. */
  title?: string;
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
export const AddPhotoModal = ({
  open,
  onClose,
  onCapture,
  title = TITLE,
}: AddPhotoProps) => (
  <ResponsiveDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
    title={title}
  >
    {/* Mounted only while open: a closed dialog holds no camera stream. */}
    {open && <AddPhotoBody onCapture={onCapture} showTitle={false} />}
  </ResponsiveDialog>
);

/**
 * The dialog's title and body, apart from the modal around them: a modal
 * renders through a portal that a static render never mounts, so this is the
 * part a markup test can reach without stubbing the dialog primitive. Mounted
 * only while the modal is open, so its state starts fresh each time. Inside
 * `AddPhotoModal` the sheet draws the title (`showTitle={false}` here), so it
 * is not read twice.
 */
export const AddPhotoBody = ({
  onCapture,
  showTitle = true,
}: Pick<AddPhotoProps, "onCapture"> & { showTitle?: boolean }) => {
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
    <div className="flex flex-col gap-4">
      {showTitle && <h2 className="type-title-2">{TITLE}</h2>}
      {blockers.length === 0 && (
        <CameraCapture onCapture={onCameraCapture} showLibrary={false} />
      )}
      <LoadingButton
        variant="outline"
        loading={busy}
        disabled={blockers.length > 0}
        onClick={() => input.current?.click()}
      >
        {!busy && <PhotoLibrary aria-hidden />}
        Choose a photo
      </LoadingButton>
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
        <p
          key={blocker}
          className="type-footnote flex items-start gap-1.5 text-ink-2"
        >
          <Warning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {blocker}
        </p>
      ))}
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

/**
 * L02 — the re-buy card's line. It promises only what Add photo keeps: a
 * private photo of the item, on your own gallery (CR-8). Nothing reads a
 * price or a date from it, and it never becomes the bottle's picture.
 */
export const REBUY_PHOTO_BODY =
  "Snap its label or receipt to keep a private photo of it.";

/**
 * L02 — the re-buy card (the DrinkSoon board): "Another <name> added" and
 * the line above, with [Add photo] [Not now]. The title comes from
 * `rebuyOffer`.
 */
export const RebuyPhotoOffer = ({
  title,
  onAddPhoto,
  onDismiss,
}: {
  title: string;
  onAddPhoto: () => void;
  onDismiss: () => void;
}) => (
  <div data-slot="rebuy-photo" className="flex flex-col gap-4">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
        <PhotoLibrary aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="type-headline text-ink-1">{title}</p>
        <p className="type-footnote text-ink-2">{REBUY_PHOTO_BODY}</p>
      </div>
    </div>
    <div className="flex gap-2">
      <Button className="flex-1" onClick={onAddPhoto}>
        Add photo
      </Button>
      <Button className="flex-1" variant="ghost" onClick={onDismiss}>
        Not now
      </Button>
    </div>
  </div>
);
