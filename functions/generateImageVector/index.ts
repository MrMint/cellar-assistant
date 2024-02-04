import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { NhostClient } from "@nhost/nhost-js";
import { Item_Image } from "@shared/gql/graphql.js";
import { Request, Response } from "express";
import { isNil, isNotNil } from "ramda";
import { createImageEmbeddingAsync } from "../_utils/gcp.js";
import { getCredential } from "../_utils/queries.js";
import { updateItemImageMutation } from "../generatePlaceholder/_queries.js";

const {
  NHOST_ADMIN_SECRET,
  NHOST_SUBDOMAIN,
  NHOST_REGION,
  CREDENTIALS_GCP_ID,
  GOOGLE_GCP_VERTEX_AI_ENDPOINT,
  NHOST_WEBHOOK_SECRET,
} = process.env;

const nhostClient = new NhostClient({
  subdomain: NHOST_SUBDOMAIN,
  region: NHOST_REGION,
  adminSecret: NHOST_ADMIN_SECRET,
});

let predictionServiceClient: PredictionServiceClient;

type input = {
  event: { data: { new: Item_Image } };
};
export default async function generateItemImageVector(
  req: Request<any, any, input>,
  res: Response,
) {
  try {
    console.log(`Receieved request`);

    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }
    // TODO improve gcp credential handling
    if (isNil(predictionServiceClient)) {
      const credResult = await nhostClient.graphql.request(getCredential, {
        id: CREDENTIALS_GCP_ID,
      });
      predictionServiceClient = new PredictionServiceClient({
        credentials: credResult.data.admin_credentials_by_pk.credentials,
        apiEndpoint: GOOGLE_GCP_VERTEX_AI_ENDPOINT,
      });
      console.log("Initialized GCP clients");
    }

    const {
      event: {
        data: { new: item },
      },
    } = req.body;
    console.log(`Receieved request for item_image with id ${item.id}`);

    let {
      presignedUrl: { url },
    } = await nhostClient.storage.getPresignedUrl({
      fileId: item.file_id,
    });

    const response = await fetch(url);
    const image = await response.arrayBuffer();
    const content = Buffer.from(image);
    console.log("Fetched image");

    console.log(`Received request`);
    const result = await createImageEmbeddingAsync(
      predictionServiceClient,
      content,
    );

    const insertVectorResult = await nhostClient.graphql.request(
      updateItemImageMutation,
      {
        itemId: item.id,
        item: {
          vector: JSON.stringify(result),
        },
      },
    );

    if (isNotNil(insertVectorResult.error)) {
      console.log(insertVectorResult.error);
      return res.status(500).send();
    }
    console.log(`Updated item_image vector`);

    return res.status(200).send();
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
