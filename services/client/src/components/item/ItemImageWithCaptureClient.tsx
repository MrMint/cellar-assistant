"use client";

import type { StaticImageData } from "next/image";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useClient, useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { UploadRejectedError, uploadFile } from "@/lib/api/files";
import { readFragment } from "@/lib/api/graphql";
import { AttachItemImageMutation, ItemImageFragment } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { SetCellarItemDisplayImageMutation } from "./fragments";
import { ItemImage } from "./ItemImage";

interface ItemImageWithCaptureClientProps {
  url?: string | null;
  placeholder?: string | null;
  fallback: StaticImageData;
  itemId: string;
  itemType: ApiItemType;
  cellarId: string;
  cellarItemId: string;
}

/**
 * `82450ad1:src/components/item/ItemImageWithCaptureClient.tsx`, restored.
 *
 * Old: `item_image_upload(image: base64)` then
 * `update_cellar_items_by_pk(display_image_id)`. New, in the same order:
 * `uploadFile` (presigned PUT + `verifyUpload`), `attachItemImage` (a public
 * image of the item), then `updateCellarItem(displayImageId)` — G15's
 * `CellarItem.displayImage` reads it back. Any step's refusal is thrown, and
 * `AddPhotoModal` shows it; the old version dropped the second step's error.
 */
export function ItemImageWithCaptureClient({
  url,
  placeholder,
  fallback,
  itemId,
  itemType,
  cellarId,
  cellarItemId,
}: ItemImageWithCaptureClientProps) {
  const client = useClient();
  const router = useRouter();
  const [, attachImage] = useMutation(AttachItemImageMutation);
  const [, setDisplayImage] = useMutation(SetCellarItemDisplayImageMutation);

  const handleCaptureImage = useCallback(
    async (image: File) => {
      let fileId: string;
      try {
        fileId = await uploadFile(client, image, "item-image");
      } catch (cause) {
        if (cause instanceof UploadRejectedError) {
          throw new Error(cause.failure.message);
        }
        throw cause;
      }
      const attached = unwrapResult(
        (
          await attachImage({
            itemId,
            type: itemType,
            input: { fileId, isPublic: true },
          })
        ).data?.attachItemImage,
        "ItemImage",
      );
      if (!attached.ok) throw new Error(attached.error.message);

      const updated = unwrapResult(
        (
          await setDisplayImage({
            cellarId,
            cellarItemId,
            displayImageId: readFragment(ItemImageFragment, attached.data).id,
          })
        ).data?.updateCellarItem,
        "CellarItem",
      );
      if (!updated.ok) throw new Error(updated.error.message);
      router.refresh();
    },
    [
      attachImage,
      cellarId,
      cellarItemId,
      client,
      itemId,
      itemType,
      router,
      setDisplayImage,
    ],
  );

  return (
    <ItemImage
      url={url}
      placeholder={placeholder}
      fallback={fallback}
      onCaptureImage={handleCaptureImage}
    />
  );
}
