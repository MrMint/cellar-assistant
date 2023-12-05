import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { ImageAnnotatorClient, v1 } from "@google-cloud/vision";
import { NhostClient } from "@nhost/nhost-js";
import pLimit from "p-limit";
import { isEmpty, isNil, not } from "ramda";
import { callPredict } from "../_utils/gcp.js";
import { isFulfilled } from "../_utils/index.js";
import {
  addTextExtractionResultsMutation,
  getFileQuery,
} from "../_utils/queries.js";
import { ItemType } from "../getItemDefaults/_utils.js";

export type GetTextFromImageBody = {
  fileId: string;
  itemType: ItemType;
};
type TextBlockResult = {
  raw_text: string;
  enhanced_text: string;
  bounding_box: string;
};
export type GetTextFromImageData = TextBlockResult[];

export default async function getTextFromImage(
  fileId: string,
  itemType: ItemType,
  nhostClient: NhostClient,
  imageAnnotatorClient: ImageAnnotatorClient,
  predictionServiceClient: PredictionServiceClient,
) {
  try {
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
      throw new Error("Unexpected error while retrieving file metadata");
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

    const annotateResponse = await imageAnnotatorClient.annotateImage({
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
                // text-bison@latest seems to frequently not want to respond due to the general
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
        throw new Error("Error predicting text");

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

    return results;
  } catch (exception) {
    console.log(exception);
    throw new Error("Unexpected Error");
  }
}
