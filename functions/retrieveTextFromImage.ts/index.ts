import { v1 } from "@google-cloud/vision";
import { Request, Response } from "express";
import { NhostClient } from "@nhost/nhost-js";
import { addTextExtractionResultsMutation, getFileQuery } from "./_queries";
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { callPredict } from "../_utils/gcp";
import pLimit from "p-limit";
import { isFulfilled } from "../_utils";
import { isEmpty, isNil, not } from "ramda";
import { ItemType } from "../getItemDefaults/_utils";

const {
  NHOST_ADMIN_SECRET,
  NHOST_SUBDOMAIN,
  NHOST_REGION,
  GOOGLE_GCP_SERVICE_ACCOUNT_CREDENTIALS_CLIENT_EMAIL,
  GOOGLE_GCP_SERVICE_ACCOUNT_CREDENTIALS_PRIVATE_KEY,
  GOOGLE_GCP_VERTEX_AI_ENDPOINT,
} = process.env;

const nhostClient = new NhostClient({
  subdomain: NHOST_SUBDOMAIN,
  region: NHOST_REGION,
  adminSecret: NHOST_ADMIN_SECRET,
});

const client = new v1.ImageAnnotatorClient({
  credentials: {
    client_email: GOOGLE_GCP_SERVICE_ACCOUNT_CREDENTIALS_CLIENT_EMAIL,
    private_key: GOOGLE_GCP_SERVICE_ACCOUNT_CREDENTIALS_PRIVATE_KEY,
  },
});

const predictionServiceClient = new PredictionServiceClient({
  credentials: {
    client_email: GOOGLE_GCP_SERVICE_ACCOUNT_CREDENTIALS_CLIENT_EMAIL,
    private_key: GOOGLE_GCP_SERVICE_ACCOUNT_CREDENTIALS_PRIVATE_KEY,
  },
  apiEndpoint: GOOGLE_GCP_VERTEX_AI_ENDPOINT,
});

export type RetrieveTextFromImageBody = {
  fileId: string;
  itemType: ItemType;
};
type TextBlockResult = {
  raw_text: string;
  enhanced_text: string;
  bounding_box: string;
};
export type RetrieveTextFromImageData = TextBlockResult[];

export default async function retrieveTextFromImage(
  req: Request<any, any, RetrieveTextFromImageBody, any>,
  res: Response<RetrieveTextFromImageData>,
) {
  if (req.method !== "POST") return res.status(405).send();
  if (
    req.headers["nhost-webhook-secret"] !== process.env.NHOST_WEBHOOK_SECRET
  ) {
    return res.status(400).send();
  }

  const { fileId, itemType } = req.body;
  console.log(`Recieved request with ${fileId}`);

  const fileMetadata = await nhostClient.graphql.request(getFileQuery, {
    id: fileId,
  });
  console.log("Retrieved file metadata");

  if (
    fileMetadata.error === undefined ||
    fileMetadata.data.file === undefined ||
    fileMetadata.data.file.mimeType.includes("image/") === false ||
    fileMetadata.data.file.bucket.id !== "label_images" // TODO any reason to limit this?
  ) {
    return res.status(500).send();
  }

  let {
    presignedUrl: { url },
  } = await nhostClient.storage.getPresignedUrl({
    fileId,
  });
  console.log("Fetched image url");

  const response = await fetch(url);
  const image = await response.arrayBuffer();
  const content = Buffer.from(image);
  console.log("Fetched image");

  const annotateResponse = await client.annotateImage({
    image: {
      content,
    },
    features: [
      {
        type: "TEXT_DETECTION",
      },
    ],
  });
  console.log("Completed annotating image");

  const annotateResult =
    annotateResponse[0].fullTextAnnotation?.pages[0]?.blocks.map((x) => ({
      raw_text: x.paragraphs
        .map((y) => {
          const paragraph = y.words
            .map((z) => z.symbols.map((n) => n.text).join(""))
            .join(" ");
          return paragraph.replace(" . ", ". ").replace(" , ", ", ");
        })
        .join(""),
      bounding_box: `(${x.boundingBox.vertices
        .map((vert) => `${vert.x},${vert.y}`)
        .join(",")})`,
    }));

  console.log("Completed parsing annotation result");
  let results = new Array<TextBlockResult>();

  if (annotateResult !== undefined) {
    const limit = pLimit(5);

    const predictResults = await Promise.allSettled(
      annotateResult
        .filter((x) => not(isEmpty(x.raw_text)))
        .map((x) => {
          return limit(async () => {
            const prediction = await callPredict(
              predictionServiceClient,
              `For the given input text below found on a ${itemType} bottles label perform the following tasks:
              1. Correct spelling, punctuation and grammar
              2. Remove any text that would trigger your safety filter
              3. Format the text for a ${itemType} bottle label

              input: ${x.raw_text}
              output: 
            `,
              {
                temperature: 0.7,
                maxOutputTokens: 768,
                topP: 0.95,
                topK: 40,
              },
              "google",
              // text-bison@latest seems to frequentlynot want to respond due to the general
              // surgeon warning (Pregnancy and Birth defect portion)?
              "text-bison@001",
            );
            return {
              ...x,
              enhanced_text: prediction,
            };
          });
        }),
    );
    console.log("Completed predicting text annotations");

    if (predictResults.find((x) => x.status === "rejected"))
      return res.status(500).send();

    results = predictResults.filter(isFulfilled).map((x) => x.value);

    console.log("Completed retrieving text from image");
  }
  let analysis = {
    file_id: fileId,
    text_extraction_status: "COMPLETED",
    textBlocks: undefined,
  };

  if (not(isEmpty(results))) {
    analysis.textBlocks = { data: results };
  }

  const mutationResult = await nhostClient.graphql.request(
    addTextExtractionResultsMutation,
    {
      analysis,
    },
  );
  if (isNil(mutationResult.error)) {
    console.log("Completed predicting text annotations");
  } else {
    console.log(mutationResult.error);
  }

  return res.status(200).send(results);
}
