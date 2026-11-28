"use client";

import Image from "next/image";
import { type ReactNode, useCallback, useState } from "react";
import { Camera } from "@/components/app/icons";
import { cn } from "@/lib/utils";
import { getNextPlaceholder } from "@/utilities";
import { AddPhotoModal } from "./AddPhoto";

export type ItemImageProps = {
  /** Presigned `ItemImage.file.url` — was a Nhost `file_id`. */
  url?: string | null;
  placeholder?: string | null;
  /**
   * What shows with no photo (or one that failed to load): the item's
   * `LabelPlate` (N28), filling the square tile.
   */
  fallback: ReactNode;
  /** Was a base64 data URL from `CameraCapture`; now the picked `File`. */
  onCaptureImage?: (image: File) => Promise<void>;
  /** The tile's shape (X09's hero is 4:3 on a phone); square by default. */
  className?: string;
};

/**
 * `82450ad1:src/components/item/ItemImage.tsx`, restored.
 *
 * The presigned read goes through `next/image` as the Nhost URL did — read
 * URLs are stable per window now (`next.config.mjs`, `imagesConfig`). One
 * addition: a URL that fails to load (aged out in a long-open tab) falls back
 * to the item's LabelPlate, which replaced the type's clip art (N28).
 *
 * Editable, the whole tile is one button ("Add a photo" / "Update photo"),
 * where the Joy card was a clickable `div` a keyboard could not reach.
 */
export const ItemImage = ({
  url,
  fallback,
  placeholder,
  onCaptureImage,
  className,
}: ItemImageProps) => {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleEdit = useCallback(
    async (image: File) => {
      if (onCaptureImage !== undefined) {
        await onCaptureImage(image);
        setOpen(false);
      }
    },
    [onCaptureImage],
  );

  const imageUrl = failed ? undefined : (url ?? undefined);
  const hasImage = imageUrl !== undefined;
  const canEdit = onCaptureImage !== undefined;

  const picture = (
    <>
      {imageUrl !== undefined && (
        <Image
          src={imageUrl}
          alt="A picture of a glass"
          height={500}
          width={500}
          placeholder={getNextPlaceholder(placeholder)}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {!hasImage && <div className="absolute inset-0">{fallback}</div>}
    </>
  );
  const tile = cn(
    "relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-1",
    className,
  );

  if (!canEdit) {
    return <div className={tile}>{picture}</div>;
  }

  return (
    <>
      <button
        type="button"
        // Named by what it does: read from its content, the name would start
        // with the picture's alt ("A picture of a glass Add a photo").
        aria-label={hasImage ? "Update photo" : "Add a photo"}
        onClick={() => setOpen(true)}
        className={cn(
          tile,
          "cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {picture}
        {/* A corner pill either way: over a LabelPlate a full-tile scrim
            would hide the very label it stands in for. */}
        <span className="surface-glass absolute right-2 bottom-2 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium text-ink-1 text-xs">
          <Camera aria-hidden className="size-3.5" />
          {hasImage ? "Update photo" : "Add a photo"}
        </span>
      </button>
      <AddPhotoModal
        open={open}
        onClose={() => setOpen(false)}
        onCapture={handleEdit}
      />
    </>
  );
};
