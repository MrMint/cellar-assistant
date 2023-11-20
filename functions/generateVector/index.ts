import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { NhostClient } from "@nhost/nhost-js";
import {
  Beers,
  Coffees,
  Item_Vectors_Bool_Exp,
  Spirits,
  Wines,
} from "@shared/gql/graphql.js";
import {
  formatBeerStyle,
  formatCountry,
  formatSpiritType,
  formatWineStyle,
  formatWineVariety,
} from "@shared/utility/index.js";
import { Request, Response } from "express";
import { isNil, isNotNil } from "ramda";
import { createDocumentEmbeddingAsync } from "../_utils/gcp.js";
import { getCredential } from "../_utils/queries.js";
import { deleteOldVectorsMutation, insertVectorMutation } from "./_queries.js";

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

type TableName = "beers" | "wines" | "spirits" | "coffees";

const getDeleteVectorWhereClause = (
  type: TableName,
  newId: number,
  itemId: string,
): Item_Vectors_Bool_Exp => {
  let where = {
    id: { _neq: newId },
  } as Item_Vectors_Bool_Exp;
  switch (type) {
    case "beers":
      return { ...where, beer_id: { _eq: itemId } };
    case "wines":
      return { ...where, wine_id: { _eq: itemId } };
    case "spirits":
      return { ...where, spirit_id: { _eq: itemId } };
    case "coffees":
      return { ...where, coffee_id: { _eq: itemId } };
    default:
      throw new Error("unsupported table name");
  }
};

const getEmbeddingText = (
  type: "beers" | "wines" | "spirits",
  item: Beers | Wines | Spirits,
) => {
  switch (type) {
    case "beers":
      return `${item.name} is a ${formatBeerStyle(
        (item as Beers).style,
      )} style beer. It was produced in ${formatCountry(item.country)}.`;
    case "wines":
      return `${item.name} is a ${formatWineVariety(
        (item as Wines).variety,
      )} ${formatWineStyle((item as Wines).style)} wine. It was produced in ${
        (item as Wines).region
      } ${formatCountry(item.country)}.`;
    case "spirits":
      return `${item.name} is a ${formatSpiritType(
        (item as Spirits).type,
      )} style spirit/liquor. It was produced in ${formatCountry(
        item.country,
      )}.`;
    case "coffees":
      return `${item.name} is a ${formatSpiritType(
        (item as Coffees).roast_level,
      )} coffee. It was produced in ${formatCountry(item.country)}.`;
    default:
      break;
  }
};
let predictionServiceClient: PredictionServiceClient;

type input = {
  table: { name: TableName };
  event: { data: { new: Beers | Wines | Spirits | Coffees } };
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
      table: { name },
      event: {
        data: { new: item },
      },
    } = req.body;

    console.log(`Received request`);
    const result = await createDocumentEmbeddingAsync(
      predictionServiceClient,
      name,
      getEmbeddingText(name, item),
    );

    const insertVectorResult = await nhostClient.graphql.request(
      insertVectorMutation,
      {
        vector: {
          beer_id: name === "beers" ? item.id : undefined,
          spirit_id: name === "spirits" ? item.id : undefined,
          wine_id: name === "wines" ? item.id : undefined,
          coffee_id: name === "coffees" ? item.id : undefined,
          vector: JSON.stringify(result),
        },
      },
    );

    if (isNotNil(insertVectorResult.error)) {
      console.log(insertVectorResult.error);
      return res.status(500).send();
    }
    console.log(`Inserted item_vector`);

    const deleteOldVectorsResult = await nhostClient.graphql.request(
      deleteOldVectorsMutation,
      {
        where: getDeleteVectorWhereClause(
          name,
          insertVectorResult.data.insert_item_vectors_one.id,
          item.id,
        ),
      },
    );
    console.log(
      `Removed ${deleteOldVectorsResult.data?.delete_item_vectors?.affected_rows}`,
    );

    return res.status(200).send();
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
