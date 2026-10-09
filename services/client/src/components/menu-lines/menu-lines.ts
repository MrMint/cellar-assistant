/**
 * X07 — the rules behind a menu line on screen, kept out of the components so
 * they are tested on their own (`menu-lines.test.ts`).
 *
 * ## Grouped by what the line *is*, not by the menu's headings
 *
 * Lines used to be grouped by `menu_category`, which the read leaves null
 * for most menus — so every line landed under one "Other" heading. The group
 * is now the line's type: the matched item's when it has one (that is what
 * the line turned out to be), else the type the read detected. Order is the
 * app's one type order — wine, beer, spirit, sake, coffee, tea — with
 * cocktails beside the spirits they are made from, and anything unknown
 * last.
 *
 * ## Reasons are facts, in words
 *
 * `menuLineReasons` turns `PlaceMenuItem.forYou` (and the matched item's
 * Save state) into chip text: "In Bar Cart", "You ★4.5", "Sam loved it",
 * "Like the Lagavulin 16 you rated ★4.5", "On Want to try". Every one of them
 * names a row the viewer could go and look at. There is no affinity
 * percentage and nothing here computes one.
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { MenuItemView } from "@/components/map/adapter";
import { menuLineText } from "@/utilities/menu-line-text";

export type MenuGroupKey =
  | "WINE"
  | "BEER"
  | "SPIRIT"
  | "COCKTAIL"
  | "SAKE"
  | "COFFEE"
  | "TEA"
  | "OTHER";

export const MENU_GROUP_ORDER: readonly MenuGroupKey[] = [
  "WINE",
  "BEER",
  "SPIRIT",
  "COCKTAIL",
  "SAKE",
  "COFFEE",
  "TEA",
  "OTHER",
];

export const MENU_GROUP_LABEL: Readonly<Record<MenuGroupKey, string>> = {
  WINE: "Wine",
  BEER: "Beer",
  SPIRIT: "Spirits",
  COCKTAIL: "Cocktails",
  SAKE: "Sake",
  COFFEE: "Coffee",
  TEA: "Tea",
  OTHER: "Other",
};

/** One of the six item types, upper-cased; null for anything else. */
const itemTypeOf = (type: string | null | undefined): ApiItemType | null => {
  switch (type?.toUpperCase()) {
    case "WINE":
      return "WINE";
    case "BEER":
      return "BEER";
    case "SPIRIT":
      return "SPIRIT";
    case "SAKE":
      return "SAKE";
    case "COFFEE":
      return "COFFEE";
    case "TEA":
      return "TEA";
    default:
      return null;
  }
};

export type MenuLineShape = Pick<
  MenuItemView,
  | "id"
  | "menu_item_name"
  | "detected_item_type"
  | "matched_item"
  | "search_name"
  | "for_you"
>;

/**
 * The item type the line is, or could be filed as: the matched item's, else
 * the detected one when it is one of the six. Null for a cocktail (it matches
 * a recipe, not an item) and for a line the read could not place.
 */
export const lineItemType = (line: MenuLineShape): ApiItemType | null =>
  itemTypeOf(line.matched_item?.type) ?? itemTypeOf(line.detected_item_type);

export const menuGroupOf = (line: MenuLineShape): MenuGroupKey => {
  const type = lineItemType(line);
  if (type !== null) return type;
  return line.detected_item_type?.toLowerCase() === "cocktail"
    ? "COCKTAIL"
    : "OTHER";
};

export type MenuGroup<T> = {
  readonly key: MenuGroupKey;
  readonly label: string;
  readonly lines: readonly T[];
};

/**
 * Lines grouped by type, in {@link MENU_GROUP_ORDER}, empty groups left out.
 * Within a group, lines with a reason for the viewer come first ("for you
 * here", design §5 moment 6); otherwise the order the lines arrived in is
 * kept — a stable sort, so the menu's own order survives.
 */
export const groupMenuLines = <T extends MenuLineShape>(
  lines: readonly T[],
): MenuGroup<T>[] => {
  const byGroup = new Map<MenuGroupKey, T[]>();
  for (const line of lines) {
    const key = menuGroupOf(line);
    byGroup.set(key, [...(byGroup.get(key) ?? []), line]);
  }
  return MENU_GROUP_ORDER.flatMap((key) => {
    const members = byGroup.get(key);
    if (members === undefined) return [];
    const ranked = members
      .map((line, index) => ({ line, index, mine: hasReasons(line) ? 0 : 1 }))
      .sort((a, b) => a.mine - b.mine || a.index - b.index)
      .map(({ line }) => line);
    return [{ key, label: MENU_GROUP_LABEL[key], lines: ranked }];
  });
};

/** `4.5` → "4.5", `4` → "4" — half stars, never a trailing ".0". */
export const starText = (score: number): string =>
  Number.isInteger(score) ? String(score) : score.toFixed(1);

/** "Sam loved it", "Sam and Kim loved it", "Sam and 2 friends loved it". */
export const friendsLovedText = (
  names: readonly string[],
  count: number,
): string | null => {
  if (count <= 0) return null;
  const [first, second] = names;
  if (first === undefined) {
    return count === 1 ? "A friend loved it" : `${count} friends loved it`;
  }
  if (count === 1) return `${first} loved it`;
  if (count === 2 && second !== undefined) {
    return `${first} and ${second} loved it`;
  }
  const others = count - 1;
  return `${first} and ${others} ${others === 1 ? "friend" : "friends"} loved it`;
};

export type MenuLineReasonKind =
  | "cellar"
  | "yourScore"
  | "friends"
  | "like"
  | "wantToTry";

export type MenuLineReason = {
  readonly kind: MenuLineReasonKind;
  readonly label: string;
};

/**
 * The chips a line earns, strongest first: the bottle you already own, your
 * own score, your friends', the bottle it resembles, then that you saved it.
 */
export const menuLineReasons = (line: MenuLineShape): MenuLineReason[] => {
  const forYou = line.for_you;
  const reasons: MenuLineReason[] = [];
  if (forYou?.cellar) {
    reasons.push({ kind: "cellar", label: `In ${forYou.cellar.name}` });
  }
  if (forYou?.your_score != null) {
    reasons.push({
      kind: "yourScore",
      label: `You ★${starText(forYou.your_score)}`,
    });
  }
  const friends =
    forYou === null
      ? null
      : friendsLovedText(
          forYou.friends_who_loved,
          forYou.friends_who_loved_count,
        );
  if (friends !== null) reasons.push({ kind: "friends", label: friends });
  if (forYou?.like_you_rated) {
    reasons.push({
      kind: "like",
      label: `Like the ${forYou.like_you_rated.name} you rated ★${starText(
        forYou.like_you_rated.score,
      )}`,
    });
  }
  if (line.matched_item?.is_want_to_try === true) {
    reasons.push({ kind: "wantToTry", label: "On Want to try" });
  }
  return reasons;
};

const hasReasons = (line: MenuLineShape): boolean =>
  menuLineReasons(line).length > 0;

/** What the catalog is searched for when a line has no match yet. */
export const candidateQuery = (line: MenuLineShape): string =>
  line.search_name ?? menuLineText(line.menu_item_name);

/**
 * What "Find a recipe" searches for on a cocktail line: the pipeline's search
 * name, else the drink's own name — the segment before the menu's dash, so
 * "OLD FASHIONED — Buffalo Trace, demerara" searches "Old Fashioned". The
 * recipe search matches a group's name, and the spec after the dash is never
 * part of it ("No recipe groups found" for the whole line).
 */
export const recipeQuery = (line: MenuLineShape): string => {
  if (line.search_name !== null && line.search_name.trim() !== "") {
    return line.search_name;
  }
  const text = menuLineText(line.menu_item_name);
  const head = text.split(/\s+[—–-]\s+/)[0]?.trim() ?? "";
  return head === "" ? text : head;
};
