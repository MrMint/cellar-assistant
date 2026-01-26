"use client";

import {
  addItemImageMutation,
  updateCellarItemMutation,
} from "@cellar-assistant/shared/queries";
import type { StaticImageData } from "next/image";
import { isNil } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { ItemImage } from "./ItemImage";

interface ItemImageWithCaptureClientProps {
  fileId?: string;
  placeholder?: string | null;
  fallback: StaticImageData;
  itemId: string;
  itemType: "BEER" | "WINE" | "SPIRIT" | "COFFEE";
  cellarItemId: string;
}

export function ItemImageWithCaptureClient({
  fileId,
  placeholder,
  fallback,
  itemId,
  itemType,
  cellarItemId,
}: ItemImageWithCaptureClientProps) {
  const client = useClient();

  const handleCaptureImage = useCallback(
    async (image: string) => {
      const addImageResult = await client.mutation(addItemImageMutation, {
        input: { image, item_id: itemId, item_type: itemType },
      });

      if (isNil(addImageResult.error)) {
        const _updateItemResult = await client.mutation(
          updateCellarItemMutation,
          {
            id: cellarItemId,
            item: {
              display_image_id: addImageResult.data?.item_image_upload?.id,
            },
          },
        );
      }
    },
    [client, itemId, itemType, cellarItemId],
  );

  return (
    <ItemImage
      fileId={fileId}
      placeholder={placeholder}
      fallback={fallback}
      onCaptureImage={handleCaptureImage}
    />
  );
}
