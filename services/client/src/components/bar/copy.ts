/**
 * The words X14 puts on screen for availability and makeability — pure, so
 * the recipe page, the item page and What can I make all say the same thing
 * and a test can hold them to it.
 *
 * Voice (design §3.6): short, plain, never a percentage, never a claim the
 * data cannot back — "Not tracked" rather than a guess.
 */

export type MakeabilityStatus = "MAKE_NOW" | "ONE_AWAY" | "MISSING";

export type MakeabilityLike = {
  readonly status: MakeabilityStatus;
  readonly missing: readonly string[];
  readonly substituteCount: number;
};

export type AvailabilityStatus = "HAVE" | "SUBSTITUTE" | "MISSING" | "UNKNOWN";
export type AvailabilitySource = "BOTTLE" | "PANTRY" | "STAPLE";

export type AvailabilityLike = {
  readonly status: AvailabilityStatus;
  readonly source?: AvailabilitySource | null;
  readonly label?: string | null;
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "Gin, Campari" / "Gin, Campari +2". */
export const listMissing = (missing: readonly string[], shown = 2): string => {
  const head = missing.slice(0, shown).join(", ");
  const rest = missing.length - shown;
  return rest > 0 ? `${head} +${rest}` : head;
};

/** The one-line verdict on a recipe. */
export const makeabilityHeadline = (makeability: MakeabilityLike): string => {
  switch (makeability.status) {
    case "MAKE_NOW":
      return "You can make this";
    case "ONE_AWAY":
      return "One bottle away";
    case "MISSING":
      return `Missing ${makeability.missing.length}`;
  }
};

/** What follows the verdict: the swaps, or what to get. */
export const makeabilityDetail = (
  makeability: MakeabilityLike,
): string | null => {
  if (makeability.status === "MAKE_NOW") {
    return makeability.substituteCount === 0
      ? null
      : `with ${plural(makeability.substituteCount, "swap", "swaps")}`;
  }
  if (makeability.missing.length === 0) return null;
  return listMissing(makeability.missing);
};

/** A row's description in What can I make and "Cocktails with this". */
export const matchDescription = (makeability: MakeabilityLike): string => {
  if (makeability.status === "MAKE_NOW") {
    return makeability.substituteCount === 0
      ? "Everything's in your bar"
      : `Make it ${makeabilityDetail(makeability)}`;
  }
  if (makeability.status === "ONE_AWAY") {
    return `Needs ${makeability.missing[0] ?? "one more thing"}`;
  }
  return `Needs ${listMissing(makeability.missing)}`;
};

/** The short tag beside one ingredient. */
export const availabilityText = (availability: AvailabilityLike): string => {
  switch (availability.status) {
    case "HAVE":
      if (availability.source === "STAPLE") return "Staple";
      if (availability.source === "PANTRY") return "In your pantry";
      return availability.label
        ? `You have ${availability.label}`
        : "You have it";
    case "SUBSTITUTE":
      return availability.label ? `Swap: ${availability.label}` : "Swap";
    case "MISSING":
      return "Missing";
    case "UNKNOWN":
      return "Not tracked";
  }
};
