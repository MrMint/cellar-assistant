import {
  type PredictionServiceClient,
  helpers,
} from "@google-cloud/aiplatform";
import { dataUrlToImageBuffer } from ".";

const { GOOGLE_GCP_VERTEX_AI_LOCATION, GOOGLE_GCP_PROJECT_ID } = process.env;

export async function callPredict(
  predictionServiceClient: PredictionServiceClient,
  prompt: string,
  parameter = {
    temperature: 0.7,
    maxOutputTokens: 768,
    topP: 0.95,
    topK: 40,
  },
  modelPublisher = "google",
  model = "text-bison@002",
) {
  // Configure the parent resource
  try {
    const endpoint = `projects/${GOOGLE_GCP_PROJECT_ID}/locations/${GOOGLE_GCP_VERTEX_AI_LOCATION}/publishers/${modelPublisher}/models/${model}`;
    const instanceValue = helpers.toValue({
      prompt,
    });
    const instances = [instanceValue];
    const parameters = helpers.toValue(parameter);

    const request = {
      endpoint,
      instances,
      parameters,
    };

    // Predict request
    const response = await predictionServiceClient.predict(request);
    return response[0].predictions[0].structValue.fields.content.stringValue;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function createDocumentEmbeddingAsync(
  predictionServiceClient: PredictionServiceClient,
  title: string,
  content: string,
  parameter = {
    temperature: 0,
    maxOutputTokens: 256,
    topP: 0,
    topK: 1,
  },
  modelPublisher = "google",
  model = "textembedding-gecko@003",
) {
  // Configure the parent resource
  try {
    const endpoint = `projects/${GOOGLE_GCP_PROJECT_ID}/locations/${GOOGLE_GCP_VERTEX_AI_LOCATION}/publishers/${modelPublisher}/models/${model}`;
    const instanceValue = helpers.toValue({
      task_type: "SEMANTIC_SIMILARITY",
      content,
    });
    const instances = [instanceValue];
    const parameters = helpers.toValue(parameter);

    const request = {
      endpoint,
      instances,
      parameters,
    };

    // Predict request
    const response = await predictionServiceClient.predict(request);
    const result =
      response[0].predictions[0].structValue.fields.embeddings.structValue.fields.values.listValue.values.map(
        (x) => x.numberValue,
      );
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

type google_task_types =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING";
export async function createSearchEmbeddingAsync(
  predictionServiceClient: PredictionServiceClient,
  content: string,
  parameter = {
    temperature: 0,
    maxOutputTokens: 256,
    topP: 0,
    topK: 1,
  },
  modelPublisher = "google",
  model = "textembedding-gecko@003",
) {
  // Configure the parent resource
  try {
    const endpoint = `projects/${GOOGLE_GCP_PROJECT_ID}/locations/${GOOGLE_GCP_VERTEX_AI_LOCATION}/publishers/${modelPublisher}/models/${model}`;
    const instanceValue = helpers.toValue({
      task_type: "SEMANTIC_SIMILARITY",
      content,
    });
    const instances = [instanceValue];
    const parameters = helpers.toValue(parameter);

    const request = {
      endpoint,
      instances,
      parameters,
    };

    // Predict request
    const response = await predictionServiceClient.predict(request);
    const result =
      response[0].predictions[0].structValue.fields.embeddings.structValue.fields.values.listValue.values.map(
        (x) => x.numberValue,
      );
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function createImageEmbeddingAsync(
  predictionServiceClient: PredictionServiceClient,
  image: Buffer,
  modelPublisher = "google",
  model = "multimodalembedding@001",
) {
  // Configure the parent resource
  try {
    const endpoint = `projects/${GOOGLE_GCP_PROJECT_ID}/locations/${GOOGLE_GCP_VERTEX_AI_LOCATION}/publishers/${modelPublisher}/models/${model}`;
    const instanceValue = helpers.toValue({
      image: {
        bytesBase64Encoded: image.toString("base64"),
      },
    });
    const instances = [instanceValue];

    const request = {
      endpoint,
      instances,
    };

    // Predict request
    const response = await predictionServiceClient.predict(request);
    const result =
      response[0].predictions[0].structValue.fields.imageEmbedding.listValue.values.map(
        (x) => x.numberValue,
      );
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

function cleanJsonPrediction(prediction: string): string {
  let clean = prediction;

  // text-bison often formats the result as a markdown code block when prompting for json
  if (
    clean.includes("```JSON") ||
    clean.includes("```json") ||
    clean.includes("```")
  ) {
    clean = clean.substring(clean.indexOf("{"));
    clean = clean.substring(0, clean.lastIndexOf("}") + 1);
  }
  return clean;
}

/**
 * Attempts to parse an LLM prediction as a JSON object
 * @param prediction The prediction text
 * @returns The extracted JSON object
 */
export function convertPredictionToJson(prediction: string): any {
  return JSON.parse(cleanJsonPrediction(prediction));
}
