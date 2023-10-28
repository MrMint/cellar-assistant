import { Request, Response } from "express";
import { NhostClient } from "@nhost/nhost-js";
import {
  RetrieveTextFromImageBody,
  RetrieveTextFromImageData,
} from "../retrieveTextFromImage/index.js";
import { NhostFunctionCallResponse } from "@nhost/nhost-js/dist/clients/functions/types";
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { callPredict, convertPredictionToJson } from "../_utils/gcp";
import { isFulfilled, isRejected } from "../_utils";
import { isEmpty, isNil, isNotNil, not } from "ramda";
import {
  Beer_Defaults_Result,
  Query_RootWine_DefaultsArgs,
  Spirit_Defaults_Result,
  Wine_Defaults_Result,
} from "../_gql/graphql.js";
import { getFieldsForType, mapJsonToReturnType } from "./_utils.js";
import { addItemOnboarding } from "./_queries.js";
import { getCredential } from "../_utils/queries.js";

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

type GetItemDefaultsResult =
  | Wine_Defaults_Result
  | Beer_Defaults_Result
  | Spirit_Defaults_Result
  | {
      barcode_code?: string;
      barcode_type?: string;
      item_onboarding_id: string;
    };

export default async function getItemDefaults(
  req: Request<
    any,
    any,
    Query_RootWine_DefaultsArgs & { itemType: "BEER" | "WINE" | "SPIRIT" } & {
      session_variables?: { "x-hasura-user-id"?: string };
    }
  >,
  res: Response<GetItemDefaultsResult>,
) {
  try {
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

    let prediction: string | undefined;
    let results = {} as GetItemDefaultsResult;
    const {
      hint: { barcode, barcodeType, frontLabelFileId, backLabelFileId },
      itemType,
      session_variables,
    } = req.body;

    if (isNil(session_variables)) return res.status(400).send();
    const userId = session_variables["x-hasura-user-id"];

    if (isNil(userId)) {
      return res.status(400).send();
    }
    console.log(`Received request`);
    // TODO Check user item quota
    // TODO search reference tables for item by barcode

    const labelTasks = new Array<
      Promise<NhostFunctionCallResponse<RetrieveTextFromImageData>>
    >();

    if (isNotNil(frontLabelFileId)) {
      labelTasks.push(
        nhostClient.functions.call<
          RetrieveTextFromImageData,
          RetrieveTextFromImageBody,
          any
        >(
          "retrieveTextFromImage",
          { fileId: frontLabelFileId, itemType },
          {
            headers: {
              "nhost-webhook-secret": process.env.NHOST_WEBHOOK_SECRET,
            },
          },
        ),
      );
      console.log(`Started text extraction for front label`);
    }

    if (isNotNil(backLabelFileId)) {
      labelTasks.push(
        nhostClient.functions.call<
          RetrieveTextFromImageData,
          RetrieveTextFromImageBody,
          any
        >(
          "retrieveTextFromImage",
          { fileId: backLabelFileId, itemType },
          {
            headers: {
              "nhost-webhook-secret": process.env.NHOST_WEBHOOK_SECRET,
            },
          },
        ),
      );
      console.log(`Started text extraction for back label`);
    }

    if (labelTasks.length > 0) {
      const labelResults = await Promise.allSettled(labelTasks);
      const promiseLevelErrors = labelResults.filter(isRejected);
      const graphqlErrors = labelResults
        .filter(isFulfilled)
        .filter((x) => isNotNil(x.value.error));

      if (promiseLevelErrors.length > 0 || graphqlErrors.length > 0) {
        promiseLevelErrors.forEach(console.log);
        graphqlErrors.forEach(console.log);
        return res.status(500).send();
      }

      console.log(`Completed text extraction`);
      const labelResultsSuccess = labelResults
        .filter(isFulfilled)
        .map((x) => x.value.res.data);

      if (
        labelResultsSuccess.find((x) =>
          x.find((y) => not(isEmpty(y.enhanced_text))),
        )
      ) {
        const mergedText = labelResultsSuccess.map((x) =>
          x.flatMap((blocks) => blocks.enhanced_text).join(`
      `),
        ).join(`
      `);
        const prompt = `for the given text from a ${itemType} label return a single JSON object with the properties: ${getFieldsForType(
          itemType,
        )}.
    
    input: ${mergedText}
    output:
    `;

        console.log(prompt);
        prediction = await callPredict(predictionServiceClient, prompt);
        console.log(`Completed defaults prediction`);
        try {
          const jsonPrediction = convertPredictionToJson(prediction);

          console.log(`Completed converting defaults prediction to JSON`);

          results = mapJsonToReturnType(itemType, jsonPrediction);
        } catch (exception) {
          // TODO insert the bad prediction into the database for inspection
          console.log(exception);
          return res.status(500).send();
        }
      }
    }
    const addOnboardingResult = await nhostClient.graphql.request(
      addItemOnboarding,
      {
        onboarding: {
          barcode: barcode,
          barcode_type: barcodeType,
          back_label_image_id: backLabelFileId,
          front_label_image_id: frontLabelFileId,
          item_type: itemType,
          user_id: userId,
          raw_defaults: prediction,
          defaults: results,
          status: "COMPLETED",
        },
      },
    );

    if (isNotNil(addOnboardingResult.error)) {
      console.log(addOnboardingResult.error);
      return res.status(500).send();
    }

    if (isNotNil(barcode)) {
      results.barcode_code = barcode;
    }

    if (isNotNil(barcodeType)) {
      results.barcode_type = barcodeType;
    }

    results.item_onboarding_id =
      addOnboardingResult.data.insert_item_onboardings_one.id;
    return res.status(200).send(results);
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
