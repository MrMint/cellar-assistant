"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useMutation, useQuery } from "urql";
import { notify } from "@/components/app/notify";
import { formatKitScore } from "@/components/app/parts/Stars";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
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
export const CellarListMyReviewQuery = graphql(
  `
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
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The desktop list's F and 1 to 5 on the selected bottle (F-144, KIT § 3
 * keys): favourite (sets the opposite of what the tile shows, never flips
 * blind) and rate. Each answers with feedback and a toast, and the list is
 * read again so the tile shows it. The selected bottle's own review is read
 * while it is selected, so a rating updates it rather than adding a second;
 * a key pressed before that read answers is ignored.
 */
export function useBottleKeyWrites(selected: ListBottle | undefined): {
  favourite: (bottle: ListBottle) => void;
  rate: (bottle: ListBottle, score: number) => void;
} {
  const router = useRouter();
  const [mine, reread] = useQuery({
    query: CellarListMyReviewQuery,
    variables: {
      type: selected?.type ?? "WINE",
      itemId: selected?.itemId ?? "",
    },
    pause: selected === undefined,
    requestPolicy: "cache-and-network",
  });
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
      const item = unwrapResult(mine.data?.item, "QueryItemSuccess");
      if (!item.ok || item.data.data.id !== bottle.itemId) return;
      feedback("tick");
      const reviewId = item.data.data.myReview?.id ?? null;
      void (async () => {
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
        reread({ requestPolicy: "network-only" });
        router.refresh();
      })();
    },
    [mine.data, reread, addReview, updateReview, router],
  );

  return { favourite, rate };
}
