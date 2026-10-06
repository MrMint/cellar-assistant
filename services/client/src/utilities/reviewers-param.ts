/**
 * `?reviewers=["ME","FRIENDS"]` → the rankings reviewer filter, without
 * trusting the URL — the `parseTypesParam` treatment for the other half of
 * `/rankings`' state. The old hook did a bare `JSON.parse` here too, so a
 * hand-edited link threw during render (§7). The format is kept, so links
 * shared from production still filter; anything that is not a JSON array of
 * `ME`/`FRIENDS` reads as "no filter", and unknown members are dropped.
 */

import { RankingsFilterValue } from "@/components/ranking/RankingsFilter";

const isReviewer = (value: unknown): value is RankingsFilterValue =>
  value === RankingsFilterValue.ME || value === RankingsFilterValue.FRIENDS;

export const parseReviewersParam = (
  raw: string | null | undefined,
): RankingsFilterValue[] => {
  if (raw === null || raw === undefined || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isReviewer)
    .filter((value, index, all) => all.indexOf(value) === index);
};
