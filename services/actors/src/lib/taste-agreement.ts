/**
 * L03's two deterministic rules, with no database and no model: the archetype
 * from your ratings, and agreement between two people's ratings.
 *
 * `TasteActor` loads the rows (already filtered by what the viewer may see)
 * and hands them here, so every number on the taste profile is a function of
 * the rows alone and a test can fix the rows and assert the answer.
 */
import {
  AGREEMENT_MAX_DIFFERENCE,
  AGREEMENT_MIN_SHARED,
  ARCHETYPE_MIN_RATINGS,
  ARCHETYPE_MIN_STYLE_RATINGS,
  type ItemType,
  styleLabel,
  type TasteAgreementTypeDto,
  type TasteArchetypeDto,
  type TasteArchetypeKey,
  type TasteStyleDto,
  type TasteTypeCountDto,
} from "@cellar-assistant/contracts";

/** One person's one verdict on one item: their newest score for it. */
export type TasteRating = {
  readonly type: ItemType;
  readonly itemId: string;
  /** 0.5–5. */
  readonly score: number;
  /** The item's style value, or `null` when the item has none. */
  readonly style: string | null;
};

const TYPE_NOUN: Readonly<Record<ItemType, string>> = {
  WINE: "Wine",
  BEER: "Beer",
  SPIRIT: "Spirit",
  COFFEE: "Coffee",
  SAKE: "Sake",
  TEA: "Tea",
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const mean = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

/* -------------------------------------------------------------------------- */
/* The archetype                                                               */
/* -------------------------------------------------------------------------- */

/** Distinct items per type, most first, then in type order for ties. */
export const typeCounts = (
  ratings: readonly TasteRating[],
): TasteTypeCountDto[] => {
  const counts = new Map<ItemType, number>();
  for (const rating of ratings) {
    counts.set(rating.type, (counts.get(rating.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
};

/** Every (type, style) rated at least `ARCHETYPE_MIN_STYLE_RATINGS` times. */
export const styleStats = (
  ratings: readonly TasteRating[],
): TasteStyleDto[] => {
  const groups = new Map<
    string,
    { type: ItemType; label: string; scores: number[] }
  >();
  for (const rating of ratings) {
    const raw = rating.style?.trim();
    if (raw === undefined || raw === "") continue;
    // F-50: grouped and named by the label a person reads, so a raw enum
    // never reaches the taste line, and one style stored two ways is one row.
    const label = styleLabel(raw);
    const key = `${rating.type}\u0000${label}`;
    const group = groups.get(key) ?? { type: rating.type, label, scores: [] };
    group.scores.push(rating.score);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.scores.length >= ARCHETYPE_MIN_STYLE_RATINGS)
    .map((group) => ({
      type: group.type,
      label: group.label,
      count: group.scores.length,
      average: round2(mean(group.scores)),
    }));
};

const byBest = (a: TasteStyleDto, b: TasteStyleDto): number =>
  b.average - a.average || b.count - a.count || a.label.localeCompare(b.label);

const byWorst = (a: TasteStyleDto, b: TasteStyleDto): number =>
  a.average - b.average || b.count - a.count || a.label.localeCompare(b.label);

/**
 * The archetype, or `null` when the data is thin: fewer than
 * `ARCHETYPE_MIN_RATINGS` ratings, or fewer than two styles rated twice.
 *
 * The rules, first match wins:
 *
 * 1. mean ≥ 4.25 — GENEROUS, "Generous palate": you like most of what you try.
 * 2. mean ≤ 2.75 — EXACTING, "Hard to impress".
 * 3. one style holds ≥ 40% of your ratings — DEVOTED, "Devoted to <style>".
 * 4. three or more types rated at least three times — EXPLORER,
 *    "Cross-cellar explorer".
 * 5. your best and worst styles ≥ 1.5 stars apart — DECISIVE,
 *    "Knows what they like".
 * 6. otherwise — FOCUSED, "<Most-rated type> first".
 */
export const archetypeOf = (
  ratings: readonly TasteRating[],
): TasteArchetypeDto | null => {
  if (ratings.length < ARCHETYPE_MIN_RATINGS) return null;
  const styles = styleStats(ratings);
  if (styles.length < 2) return null;

  const overall = mean(ratings.map((rating) => rating.score));
  const loves = styles
    .filter((style) => style.average >= overall)
    .sort(byBest)
    .slice(0, 4);
  const lessKeen = styles
    .filter((style) => style.average < overall)
    .sort(byWorst)
    .slice(0, 2);

  const mostRated = [...styles].sort(
    (a, b) => b.count - a.count || byBest(a, b),
  )[0];
  const ranked = [...styles].sort(byBest);
  const spread =
    (ranked[0]?.average ?? 0) - (ranked[ranked.length - 1]?.average ?? 0);
  const types = typeCounts(ratings);
  const broadTypes = types.filter((type) => type.count >= 3).length;

  const pick = (key: TasteArchetypeKey, title: string): TasteArchetypeDto => ({
    key,
    title,
    loves,
    lessKeen,
  });

  if (overall >= 4.25) return pick("GENEROUS", "Generous palate");
  if (overall <= 2.75) return pick("EXACTING", "Hard to impress");
  if (mostRated !== undefined && mostRated.count / ratings.length >= 0.4) {
    return pick("DEVOTED", `Devoted to ${mostRated.label}`);
  }
  if (broadTypes >= 3) return pick("EXPLORER", "Cross-cellar explorer");
  if (spread >= 1.5) return pick("DECISIVE", "Knows what they like");
  const top = types[0]?.type ?? "WINE";
  return pick("FOCUSED", `${TYPE_NOUN[top]} first`);
};

const joinAnd = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/**
 * The plain line: what the profile says when no model phrases it — thin
 * data, no provider, an abstention, or an answer that failed grounding.
 */
export const fallbackLine = (
  ratingCount: number,
  archetype: TasteArchetypeDto | null,
  typeCount: number,
): string => {
  if (archetype === null) {
    const more = Math.max(1, ARCHETYPE_MIN_RATINGS - ratingCount);
    return ratingCount < ARCHETYPE_MIN_RATINGS
      ? `Rate ${more} more ${more === 1 ? "item" : "items"} to see your archetype.`
      : "Rate a few more of the same styles to see your archetype.";
  }
  const best = joinAnd(archetype.loves.slice(0, 3).map((s) => s.label));
  const worst = archetype.lessKeen[0]?.label;
  const across = `across ${typeCount} ${typeCount === 1 ? "type" : "types"}`;
  return worst === undefined
    ? `You rate ${best} highest, ${across}.`
    : `You rate ${best} highest and ${worst} lowest, ${across}.`;
};

/* -------------------------------------------------------------------------- */
/* Agreement                                                                   */
/* -------------------------------------------------------------------------- */

export type Agreement = {
  readonly shared: number;
  readonly agreed: number | null;
  readonly byType: readonly TasteAgreementTypeDto[];
};

/** Two scores agree when they are at most half a star apart. */
export const scoresAgree = (a: number, b: number): boolean =>
  Math.abs(a - b) <= AGREEMENT_MAX_DIFFERENCE + 1e-9;

/**
 * Count the items both people rated and how many of those they agree on.
 * Below `AGREEMENT_MIN_SHARED` shared items the agreed counts are withheld
 * (`null`) and no per-type breakdown is given: only the overlap is said.
 */
export const agreementOf = (
  mine: readonly TasteRating[],
  theirs: readonly TasteRating[],
): Agreement => {
  const their = new Map(
    theirs.map((rating) => [`${rating.type}:${rating.itemId}`, rating]),
  );
  const perType = new Map<ItemType, { shared: number; agreed: number }>();
  let shared = 0;
  let agreed = 0;
  for (const rating of mine) {
    const other = their.get(`${rating.type}:${rating.itemId}`);
    if (other === undefined) continue;
    const agrees = scoresAgree(rating.score, other.score);
    shared += 1;
    if (agrees) agreed += 1;
    const row = perType.get(rating.type) ?? { shared: 0, agreed: 0 };
    row.shared += 1;
    if (agrees) row.agreed += 1;
    perType.set(rating.type, row);
  }
  if (shared < AGREEMENT_MIN_SHARED)
    return { shared, agreed: null, byType: [] };
  return {
    shared,
    agreed,
    byType: [...perType.entries()]
      .map(([type, row]) => ({ type, shared: row.shared, agreed: row.agreed }))
      .sort((a, b) => b.shared - a.shared || a.type.localeCompare(b.type)),
  };
};
