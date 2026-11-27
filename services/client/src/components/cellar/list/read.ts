import {
  plainTextFromRichText,
  richTextFromReviewText,
} from "@/components/common/rich-text";
import {
  primaryBrandName,
  subtitleDescriptor,
} from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { cellarBottleHref, cellarGroupCell } from "../adapter";
import {
  CellarBottleCardFragment,
  CellarItemGroupCardFragment,
} from "../fragments";
import { CellarListGroupFragment } from "./fragments";
import type { ListBottle } from "./model";

/** The owner's note as plain words, or null. */
export const noteWords = (text: unknown): string | null => {
  const rich = richTextFromReviewText(text);
  if (rich === null) return null;
  const words = plainTextFromRichText(rich).trim();
  return words === "" ? null : words;
};

/** A `CellarListGroup` node → one tile of the list. */
export const listBottleFromNode = (
  cellarId: string,
  data: FragmentOf<typeof CellarListGroupFragment>,
): ListBottle => {
  const group = readFragment(CellarListGroupFragment, data);
  const cell = cellarGroupCell(group);
  const card = readFragment(CellarItemGroupCardFragment, group);
  const lead = readFragment(CellarBottleCardFragment, card.lead);
  const item = readFragment(ItemCardFragment, lead.item);
  const review = group.lead.item.myReview;
  const bottle = cell.bottle;
  return {
    key: cell.item.id,
    itemId: cell.item.itemId,
    type: cell.type,
    name: cell.item.name,
    maker: primaryBrandName(item) ?? null,
    style: subtitleDescriptor(item) ?? null,
    photoUrl: cell.item.displayImageUrl ?? null,
    plate: cell.item.plate ?? null,
    rating: cell.item.myScore ?? null,
    publicScore: cell.item.score ?? null,
    publicCount: cell.item.reviewCount ?? null,
    favorite: cell.item.isFavorite ?? false,
    open: bottle.openAt !== null && bottle.emptyAt === null,
    percent: bottle.percentageRemaining ?? 100,
    count: cell.group?.count ?? 1,
    match: cell.group?.match ?? null,
    note: review === null ? null : noteWords(review.text),
    noteDate: review?.updatedAt ?? null,
    addedAt: bottle.createdAt ?? null,
    href: cellarBottleHref(cellarId, cell),
  };
};
