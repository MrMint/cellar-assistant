import type { Request, Response } from "express";
import { createErrorResponse, logError } from "../_utils";
import {
  type ItemImageVectorInput,
  type ItemImageVectorOutput,
  validateItemImageVectorInput,
} from "./_types.js";

const { NHOST_WEBHOOK_SECRET, NHOST_FUNCTIONS_URL } = process.env;

/**
 * When a new item_image is inserted, this function triggers re-generation of the
 * parent item's vector via the generateItemVector endpoint. This ensures the
 * combined text+image multimodal embedding stays current.
 */
export default async function generateItemImageVector(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    ItemImageVectorInput
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateItemImageVectorInput(req.body);
    const item = validatedInput.event.data.new;

    console.log(
      `Image uploaded for item_image ${item.id}, triggering parent item vector regeneration`,
    );

    // Determine the parent item type and ID
    const parentItem = getParentItem(item);
    if (!parentItem) {
      console.log(
        `No parent item found for item_image ${item.id}, skipping vector regeneration`,
      );
      return res
        .status(200)
        .json({ success: true, itemImageId: item.id as string });
    }

    console.log(
      `Re-triggering vector generation for ${parentItem.tableName} ${parentItem.id}`,
    );

    // Call generateItemVector to regenerate the parent item's combined embedding
    const response = await fetch(`${NHOST_FUNCTIONS_URL}/generateItemVector`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "nhost-webhook-secret": NHOST_WEBHOOK_SECRET ?? "",
      },
      body: JSON.stringify({
        table: { name: parentItem.tableName },
        event: {
          data: {
            new: { id: parentItem.id },
          },
        },
      }),
    });

    if (!response.ok) {
      console.warn(
        `Failed to trigger vector regeneration: ${response.status} ${response.statusText}`,
      );
    } else {
      console.log(
        `Successfully triggered vector regeneration for ${parentItem.tableName} ${parentItem.id}`,
      );
    }

    const result: ItemImageVectorOutput = {
      success: true,
      itemImageId: item.id as string,
      retriggeredItem: { type: parentItem.tableName, id: parentItem.id },
    };

    return res.status(200).json(result);
  } catch (exception) {
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateItemImageVectorInput(req.body);
      errorContext = {
        itemImageId: context.event.data.new.id,
        fileId: context.event.data.new.file_id,
      };
    } catch {
      errorContext = {
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "generateItemImageVector");

    const errorResponse = createErrorResponse(
      exception,
      "generateItemImageVector",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

function getParentItem(
  item: ItemImageVectorInput["event"]["data"]["new"],
): { tableName: string; id: string } | null {
  if (item.beer_id) return { tableName: "beers", id: item.beer_id as string };
  if (item.wine_id) return { tableName: "wines", id: item.wine_id as string };
  if (item.spirit_id)
    return { tableName: "spirits", id: item.spirit_id as string };
  if (item.coffee_id)
    return { tableName: "coffees", id: item.coffee_id as string };
  if (item.sake_id) return { tableName: "sakes", id: item.sake_id as string };
  return null;
}
