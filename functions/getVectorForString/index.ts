import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { NhostClient } from "@nhost/nhost-js";
import { Request, Response } from "express";
import { isNil } from "ramda";
import { createSearchEmbeddingAsync } from "../_utils/gcp.js";
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

type input = {
  input: { search: string };
  session_variables?: { "x-hasura-user-id"?: string };
};

export default async function generateVector(
  req: Request<any, any, input>,
  res: Response,
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

    const {
      input: { search },
    } = req.body;
    console.log(search);
    if (isNil(search)) return res.status(400).send();
    console.log(`Received request`);
    const result = await createSearchEmbeddingAsync(
      predictionServiceClient,
      search,
    );

    console.log(`Updated friends rows`);
    return res.status(200).send(JSON.stringify(result));
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
