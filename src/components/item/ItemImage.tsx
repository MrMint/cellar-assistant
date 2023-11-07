import { AspectRatio, Card } from "@mui/joy";
import Image, { type StaticImageData } from "next/image";
import { isNil, isNotNil } from "ramda";
import { getNextPlaceholder, nhostImageLoader } from "@/utilities";

export type ItemImageProps = {
  fileId?: string;
  placeholder?: string | null;
  fallback: StaticImageData;
};

export const ItemImage = ({
  fileId,
  fallback,
  placeholder,
}: ItemImageProps) => {
  return (
    <Card sx={{ padding: "0", overflow: "hidden" }}>
      <AspectRatio ratio={1}>
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
      </AspectRatio>
    </Card>
  );
};
