import { NhostClient } from "@nhost/nhost-js";
import { Friend_Requests } from "@shared/gql/graphql.js";
import { Request, Response } from "express";
import { isNotNil } from "ramda";
import { insertFriendsAndDeleteRequest } from "./_queries.js";

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

type input = {
  event: { data: { new: Friend_Requests; old?: Friend_Requests } };
};

export default async function uploadItemImage(
  req: Request<any, any, input>,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const {
      event: {
        data: {
          new: { id, user_id, friend_id, status: newStatus },
          old: { status: oldStatus },
        },
      },
    } = req.body;

    console.log(`Received request`);

    if (oldStatus === "PENDING" && newStatus === "ACCEPTED") {
      const insertFriendsResult = await nhostClient.graphql.request(
        insertFriendsAndDeleteRequest,
        {
          friends: [
            { user_id, friend_id },
            { user_id: friend_id, friend_id: user_id },
          ],
          requestId: id,
        },
      );

      if (isNotNil(insertFriendsResult.error)) {
        console.log(insertFriendsResult.error);
        return res.status(500).send();
      }
      console.log(`Updated friends rows`);
    }

    return res.status(200).send();
  } catch (exception) {
    console.log(exception);
    return res.status(500).send();
  }
}
