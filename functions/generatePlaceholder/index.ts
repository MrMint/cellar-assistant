import { NhostClient } from "@nhost/nhost-js";
import { Request, Response } from "express";
import { isNil, isNotNil } from "ramda";
import { Item_Image } from "../_gql/graphql.js";
import { toDataUrl } from "../_utils/index.js";
import { updateItemImageMutation } from "./_queries.js";

const {
  NHOST_ADMIN_SECRET,
  NHOST_SUBDOMAIN,
  NHOST_REGION,
  NHOST_WEBHOOK_SECRET,
  PLACEHOLDER_API_URL,
} = process.env;

const nhostClient = new NhostClient({
  subdomain: NHOST_SUBDOMAIN,
  region: NHOST_REGION,
  adminSecret: NHOST_ADMIN_SECRET,
});

export default async function uploadItemImage(
  req: Request<
    any,
    any,
    {
      event: { data: { new: Item_Image } };
    }
  >,
  res: Response,
) {
  try {
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const {
      event: {
        data: {
          new: { id, file_id },
        },
      },
    } = req.body;

    console.log(`Received request`);

    const url = nhostClient.storage.getPublicUrl({
      fileId: file_id,
      width: 1000,
      quality: 90,
    });

    const imageDownloadResponse = await fetch(url);
    if (imageDownloadResponse.ok === false) return res.status(500).send();

    console.log(`Downloaded image`);

    const base64 = await toDataUrl(imageDownloadResponse);
    const placeholderResult = await fetch(PLACEHOLDER_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: base64 }),
    });

    if (placeholderResult.ok === false) return res.status(500).send();
    const placeholder = await placeholderResult.text();
    console.log(`Generated placeholder image`);

    const addItemImageResult = await nhostClient.graphql.request(
      updateItemImageMutation,
      {
        itemId: id,
        item: {
          placeholder,
        },
      },
    );

    if (
      isNotNil(addItemImageResult.error) ||
      isNil(addItemImageResult.data.update_item_image_by_pk)
    ) {
      console.log(addItemImageResult.error);
      return res.status(500).send();
    }
    console.log(`Updated item_image row`);

    return res.status(200).send();
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
