import { NhostClient } from "@nhost/nhost-js";
import {
  Item_Image_Insert_Input,
  Item_Image_Upload_Input,
  Item_Image_Upload_Result,
} from "@shared/gql/graphql.js";
import { addItemImageMutation } from "@shared/queries/index.js";
import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { isNil, isNotNil } from "ramda";
import { dataUrlToFormData } from "../_utils/index.js";

const {
  NHOST_ADMIN_SECRET,
  NHOST_SUBDOMAIN,
  NHOST_REGION,
  NHOST_WEBHOOK_SECRET,
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
      input: { input: Item_Image_Upload_Input };
      session_variables?: { "x-hasura-user-id"?: string };
    }
  >,
  res: Response<Item_Image_Upload_Result>,
) {
  try {
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const {
      input: {
        input: { item_id, image, item_type },
      },
      session_variables,
    } = req.body;
    if (isNil(session_variables)) return res.status(400).send();
    const userId = session_variables["x-hasura-user-id"];

    if (isNil(userId)) {
      return res.status(400).send();
    }
    console.log(`Received request`);

    let item: Item_Image_Insert_Input = {};
    switch (item_type) {
      case "BEER":
        item.beer_id = item_id;
        break;
      case "WINE":
        item.wine_id = item_id;
        break;
      case "SPIRIT":
        item.spirit_id = item_id;
        break;
      default:
        throw new Error("Unsupported type received");
    }
    const formData = dataUrlToFormData(image, randomUUID());
    if (isNil(formData)) throw new Error("invalid image provided");

    const { error, fileMetadata } = await nhostClient.storage.upload({
      formData,
      bucketId: "item_images",
      headers: { ...formData.getHeaders() },
    });
    if (isNotNil(error)) throw new Error("Error uploading file");

    console.log(`Uploaded image to storage`);

    const addItemImageResult = await nhostClient.graphql.request(
      addItemImageMutation,
      {
        item: {
          ...item,
          user_id: userId,
          file_id: fileMetadata.processedFiles[0].id,
          is_public: true,
        },
      },
    );

    if (
      isNotNil(addItemImageResult.error) ||
      isNil(addItemImageResult.data.insert_item_image_one)
    ) {
      console.log(addItemImageResult.error);
      return res.status(500).send();
    }
    console.log(`Added item_image row`);

    return res.status(200).send({
      __typename: "item_image_upload_result",
      id: addItemImageResult.data.insert_item_image_one.id,
    });
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
