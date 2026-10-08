"use client";

import Image, { type StaticImageData } from "next/image";
import { useCallback, useState } from "react";
import { Camera } from "@/components/app/icons";
import { cn } from "@/lib/utils";
import { getNextPlaceholder } from "@/utilities";
import { AddPhotoModal } from "./AddPhoto";

export type ItemImageProps = {
  /** Presigned `ItemImage.file.url` — was a Nhost `file_id`. */
  url?: string | null;
  placeholder?: string | null;
  fallback: StaticImageData;
  /** Was a base64 data URL from `CameraCapture`; now the picked `File`. */
  onCaptureImage?: (image: File) => Promise<void>;
};

/**
 * `82450ad1:src/components/item/ItemImage.tsx`, restored.
 *
 * The presigned read goes through `next/image` as the Nhost URL did — read
 * URLs are stable per window now (`next.config.mjs`, `imagesConfig`). One
 * addition: a URL that fails to load (aged out in a long-open tab) falls back
 * to the type's picture.
 *
 * Editable, the whole tile is one button ("Add a photo" / "Update photo"),
 * where the Joy card was a clickable `div` a keyboard could not reach.
 */
export const ItemImage = ({
  url,
  fallback,
  placeholder,
  onCaptureImage,
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
      {!hasImage && (
        <Image
          src={fallback}
          alt="A picture of a glass"
          placeholder="blur"
          fill
          className="object-cover"
        />
      )}
    </>
  );
  const tile =
    "relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-1";

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
        {!hasImage && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-linear-to-b from-black/15 to-black/55 text-white">
            <Camera aria-hidden className="size-9" />
            <span className="type-callout font-semibold">Add a photo</span>
          </span>
        )}
        {hasImage && (
          <span className="surface-glass absolute right-2 bottom-2 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium text-ink-1 text-xs">
            <Camera aria-hidden className="size-3.5" />
            Update photo
          </span>
        )}
      </button>
      <AddPhotoModal
        open={open}
        onClose={() => setOpen(false)}
        onCapture={handleEdit}
      />
    </>
  );
};
