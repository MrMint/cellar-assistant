"use client";

import { Box, Card, CardCover, Chip, Typography } from "@mui/joy";
import Image, { type StaticImageData } from "next/image";
import { isNotNil } from "ramda";
import { useCallback, useState } from "react";
import { MdCameraAlt } from "react-icons/md";
import { getNhostStorageUrl, getNextPlaceholder } from "@/utilities";
import { AddPhotoModal } from "./AddPhoto";

export type ItemImageProps = {
  fileId?: string;
  placeholder?: string | null;
  fallback: StaticImageData;
  onCaptureImage?: (imageDataUrl: string) => Promise<void>;
};

export const ItemImage = ({
  fileId,
  fallback,
  placeholder,
  onCaptureImage,
}: ItemImageProps) => {
  const [open, setOpen] = useState(false);

  const handleEdit = useCallback(
    async (image: string) => {
      if (isNotNil(onCaptureImage)) {
        await onCaptureImage(image);
        setOpen(false);
      }
    },
    [onCaptureImage],
  );

  const hasImage = isNotNil(fileId);
  const canEdit = isNotNil(onCaptureImage);

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
          {hasImage && (
            <Image
              src={getNhostStorageUrl(fileId)}
              alt="A picture of a glass"
              height={500}
              width={500}
              placeholder={getNextPlaceholder(placeholder)}
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
            <Typography level="body-sm" sx={{ color: "white", fontWeight: 600 }}>
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
      <AddPhotoModal
        open={open}
        onClose={() => setOpen(false)}
        onCapture={handleEdit}
      />
    </>
  );
};
