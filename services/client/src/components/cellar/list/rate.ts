"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useClient, useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { formatKitScore } from "@/components/app/parts/Stars";
import { graphql } from "@/lib/api/graphql";
import {
  AddItemReviewMutation,
  SetFavoriteMutation,
  UpdateItemReviewMutation,
} from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import type { ListBottle } from "./model";

/** The viewer's own review of one item: what 1 to 5 update, or add. */
export const CellarListMyReviewQuery = graphql(`
  query CellarListMyReview($type: ItemType!, $itemId: ID!) {
    item(type: $type, id: $itemId) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          myReview {
            __typename
            id
            score
          }
        }
      }
    }
  }
`);

/**
 * The desktop list's F and 1 to 5 on the selected bottle (F-144, KIT § 3
 * keys): favourite (sets the opposite of what the tile shows, never flips
 * blind) and rate. Each answers with feedback and a toast, and the list is
 * read again so the tile shows it.
 */
export function useBottleKeyWrites(): {
  favourite: (bottle: ListBottle) => void;
  rate: (bottle: ListBottle, score: number) => void;
} {
  const router = useRouter();
  const client = useClient();
  const [, setFavorite] = useMutation(SetFavoriteMutation);
  const [, addReview] = useMutation(AddItemReviewMutation);
  const [, updateReview] = useMutation(UpdateItemReviewMutation);

  const favourite = useCallback(
    (bottle: ListBottle) => {
      const next = !bottle.favorite;
      feedback("tick");
      void setFavorite({
        itemId: bottle.itemId,
        type: bottle.type,
        favorited: next,
      }).then((response) => {
        const result = unwrapResult(
          response.data?.setFavorite,
          "SetFavoritePayload",
        );
        if (!result.ok) {
          notify("Couldn't update your favourites", {
            tone: "error",
            description: result.error.message,
          });
          return;
        }
        notify(
          next
            ? `Favourited · ${bottle.name}`
            : `Unfavourited · ${bottle.name}`,
        );
        router.refresh();
      });
    },
    [setFavorite, router],
  );

  const rate = useCallback(
    (bottle: ListBottle, score: number) => {
      feedback("tick");
      void (async () => {
        const found = await client
          .query(
            CellarListMyReviewQuery,
            {
              type: bottle.type,
              itemId: bottle.itemId,
            },
            { requestPolicy: "network-only" },
          )
          .toPromise();
        const item = unwrapResult(found.data?.item, "QueryItemSuccess");
        const reviewId = item.ok ? (item.data.data.myReview?.id ?? null) : null;
        const saved =
          reviewId === null
            ? unwrapResult(
                (
                  await addReview({
                    itemId: bottle.itemId,
                    type: bottle.type,
                    input: { reviewId: crypto.randomUUID(), score },
                  })
                ).data?.addItemReview,
                "ItemReview",
              )
            : unwrapResult(
                (
                  await updateReview({
                    itemId: bottle.itemId,
                    type: bottle.type,
                    reviewId,
                    input: { score },
                  })
                ).data?.updateItemReview,
                "ItemReview",
              );
        if (!saved.ok) {
          notify("Couldn't save your rating", {
            tone: "error",
            description: saved.error.message,
          });
          return;
        }
        notify(`Rated ${formatKitScore(score)} · ${bottle.name}`, {
          tone: "success",
        });
        router.refresh();
      })();
    },
    [client, addReview, updateReview, router],
  );

  return { favourite, rate };
}
