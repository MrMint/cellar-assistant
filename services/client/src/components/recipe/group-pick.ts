/**
 * Which version a group page shows (Recipes-Browse ruling 1, MC-pick): the
 * community pick when there is one; otherwise the original, the oldest
 * version. The pick is a label from people other than the author (at least
 * 3 net votes), so the author's own votes never choose what is shown.
 */
export type GroupVersionRef = {
  readonly id: string;
  readonly createdAt?: string | null;
};

export type ShownVersion = {
  readonly id: string;
  /** Whether it is shown because it is the community's pick. */
  readonly isPick: boolean;
} | null;

const time = (value: string | null | undefined): number => {
  const parsed = value == null ? Number.NaN : Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

export const shownVersion = (
  communityPickId: string | null | undefined,
  versions: readonly GroupVersionRef[],
): ShownVersion => {
  // The API names the pick across every version, not just the page the
  // caller loaded, and nulls it for a viewer who may not see it
  // (`communityPickId`), so it needs no check against `versions` (F-107).
  if (communityPickId != null) {
    return { id: communityPickId, isPick: true };
  }
  let original: GroupVersionRef | undefined;
  for (const version of versions) {
    // Strictly older wins, so equal times keep the API's order.
    if (
      original === undefined ||
      time(version.createdAt) < time(original.createdAt)
    ) {
      original = version;
    }
  }
  return original === undefined ? null : { id: original.id, isPick: false };
};
