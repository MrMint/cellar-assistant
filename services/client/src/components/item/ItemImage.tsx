"use client";

import { Box, Card, CardCover, Chip, Typography } from "@mui/joy";
import Image, { type StaticImageData } from "next/image";
import { useCallback, useState } from "react";
import { MdCameraAlt } from "react-icons/md";
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

  return (
    <>
      <Card
        sx={{
          aspectRatio: "1",
          cursor: canEdit ? "pointer" : "default",
          overflow: "hidden",
        }}
        onClick={canEdit ? () => setOpen(true) : undefined}
      >
        <CardCover>
          {imageUrl !== undefined && (
            <Image
              src={imageUrl}
              alt="A picture of a glass"
              height={500}
              width={500}
              placeholder={getNextPlaceholder(placeholder)}
              onError={() => setFailed(true)}
            />
          )}
          {!hasImage && (
            <Image
              src={fallback}
              alt="A picture of a glass"
              placeholder="blur"
              fill
            />
          )}
        </CardCover>

        {canEdit && !hasImage && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.55))",
            }}
          >
            <MdCameraAlt size={36} color="white" />
            <Typography
              level="body-sm"
              sx={{ color: "white", fontWeight: 600 }}
            >
              Add a photo
            </Typography>
          </Box>
        )}

        {canEdit && hasImage && (
          <Box
            sx={{
              position: "absolute",
              bottom: 8,
              right: 8,
            }}
          >
            <Chip
              size="sm"
              variant="soft"
              color="neutral"
              startDecorator={<MdCameraAlt />}
              sx={{
                backdropFilter: "blur(4px)",
                "--Chip-decoratorChildHeight": "14px",
              }}
            >
              Update photo
            </Chip>
          </Box>
        )}
      </Card>
      {canEdit && (
        <AddPhotoModal
          open={open}
          onClose={() => setOpen(false)}
          onCapture={handleEdit}
        />
      )}
    </>
  );
};
