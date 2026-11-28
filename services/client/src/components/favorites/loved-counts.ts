/**
 * F-135: Loved's subtitle ("25 drinks · 2 recipes") and its type chips'
 * counts, from `Viewer.lovedCounts` (F-87). A page of `favorites` is capped,
 * so counting its rows would undercount anyone with more than one page.
 */
import { graphql, type ResultOf } from "@/lib/api/graphql";

export const LovedCountsQuery = graphql(`
  query LovedCounts {
    me {
      id
      lovedCounts {
        drinks
        recipes
        beer
        wine
        spirit
        coffee
        sake
        tea
      }
    }
  }
`);

export type LovedCounts = NonNullable<
  ResultOf<typeof LovedCountsQuery>["me"]
>["lovedCounts"];

const counted = (n: number, one: string, many: string): string | null =>
  n > 0 ? `${n} ${n === 1 ? one : many}` : null;

/** "25 drinks · 2 recipes"; a half with none (or no count) is left out. */
export const lovedSubtitle = (
  counts: LovedCounts | null | undefined,
): string | null => {
  if (counts === null || counts === undefined) return null;
  const parts = [
    counted(counts.drinks ?? 0, "drink", "drinks"),
    counted(counts.recipes ?? 0, "recipe", "recipes"),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
};

/** The counts `CellarItemsFilter` shows on its chips (zero is hidden there). */
export const lovedFilterCounts = (counts: LovedCounts | null | undefined) =>
  counts === null || counts === undefined
    ? {}
    : {
        beers: counts.beer ?? undefined,
        wines: counts.wine ?? undefined,
        spirits: counts.spirit ?? undefined,
        coffees: counts.coffee ?? undefined,
        sakes: counts.sake ?? undefined,
        teas: counts.tea ?? undefined,
      };
