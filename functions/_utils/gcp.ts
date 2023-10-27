import {
  type PredictionServiceClient,
  helpers,
} from "@google-cloud/aiplatform";

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
  model = "text-bison",
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
export async function callBatchPredict(
  predictionServiceClient: PredictionServiceClient,
  prompts: string[],
  parameter = {
    temperature: 0.7,
    maxOutputTokens: 768,
    topP: 0.95,
    topK: 40,
  },
  modelPublisher = "google",
  model = "text-bison",
) {
  // Configure the parent resource
  try {
    const endpoint = `projects/${GOOGLE_GCP_PROJECT_ID}/locations/${GOOGLE_GCP_VERTEX_AI_LOCATION}/publishers/${modelPublisher}/models/${model}`;
    const instances = prompts.map((prompt) => helpers.toValue({ prompt }));
    const parameters = helpers.toValue(parameter);

    const request = {
      endpoint,
      instances,
      parameters,
    };

    // Predict request
    const response = await predictionServiceClient.predict(request);
    return response[0].predictions.map(
      (x) => x.structValue.fields.content.stringValue,
    );
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
