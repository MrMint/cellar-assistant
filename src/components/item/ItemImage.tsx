import { Card, CardActions, CardCover, IconButton } from "@mui/joy";
import Image, { type StaticImageData } from "next/image";
import { isNil, isNotNil } from "ramda";
import { useState } from "react";
import { MdEdit } from "react-icons/md";
import { getNextPlaceholder, nhostImageLoader } from "@/utilities";
import { AddPhotoModal } from "./AddPhoto";

export type ItemImageProps = {
  fileId?: string;
  placeholder?: string | null;
  fallback: StaticImageData;
  onCaptureImage: (imageDataUrl: string) => Promise<void>;
};

export const ItemImage = ({
  fileId,
  fallback,
  placeholder,
  onCaptureImage,
}: ItemImageProps) => {
  const [open, setOpen] = useState(false);

  const handleEdit = async (image: string) => {
    await onCaptureImage(image);
    setOpen(false);
  };

  return (
    <>
      <Card sx={{ aspectRatio: "1" }}>
        <CardCover>
          {isNotNil(fileId) && (
            <Image
              src={fileId}
              alt="A picture of a glass"
              height={500}
              width={500}
              loader={nhostImageLoader}
              placeholder={getNextPlaceholder(placeholder)}
            />
          )}
          {isNil(fileId) && (
            <Image
              src={fallback}
              alt="A picture of a glass"
              placeholder="blur"
              fill
            />
          )}
        </CardCover>
        <CardActions sx={{ alignSelf: "end" }}>
          <IconButton
            variant="outlined"
            size="lg"
            onClick={() => setOpen(true)}
          >
            <MdEdit />
          </IconButton>
        </CardActions>
      </Card>
      <AddPhotoModal
        open={open}
        onClose={() => setOpen(false)}
        onCapture={handleEdit}
      />
    </>
  );
};
