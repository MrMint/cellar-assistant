/**
 * The ten reference tables, read.
 *
 * Hoisted out of `ReferenceDataActor` (A9) by E2c/X1b, for the same reason C4c
 * hoisted `derivedUuid`: a second caller appeared. `ReferenceDataActor` serves
 * one table per activation to the API's dropdowns; `lib/ai/vocabulary.ts` needs
 * all ten at once, in-process, to build the enum-constrained item-defaults
 * schema — and §8.5 forbids it reaching the actor for them from inside
 * `ItemOnboardingActor.start`'s turn. One query definition, two callers, so a
 * table that gains a row cannot serve two different vocabularies.
 *
 * Reads only. Reference tables are written by migration (`packages/db`'s
 * `writers.ts` assigns them to `infrastructure:migrations`) and
 * `ActorBase.tx()` throws for the `"reference"` category, so there is nothing
 * here to write with.
 */
import type { ReferenceKind, ReferenceRow } from "@cellar-assistant/contracts";
import {
  beerStyle,
  coffeeCultivar,
  country,
  sakeCategory,
  sakeRiceVariety,
  sakeType,
  spiritType,
  teaCategory,
  wineStyle,
  wineVariety,
} from "@cellar-assistant/db";
import { asc } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";

/**
 * One query per table rather than a `Record<ReferenceKind, PgTable>` lookup:
 * ten distinct `pgTable` instances behind one union type make Drizzle's
 * `.from()`/`.select()` overloads unable to correlate "this table" with
 * "this table's own `value`/`comment` columns" across the union, which is a
 * TypeScript limitation, not a runtime one — the `switch` sidesteps it and
 * keeps every branch concretely typed.
 */
export const selectReferenceRows = (
  db: DbOrTx,
  kind: ReferenceKind,
): Promise<ReferenceRow[]> => {
  switch (kind) {
    case "beer_style":
      return db
        .select({ value: beerStyle.value, comment: beerStyle.comment })
        .from(beerStyle)
        .orderBy(asc(beerStyle.value));
    case "coffee_cultivar":
      return db
        .select({
          value: coffeeCultivar.value,
          comment: coffeeCultivar.comment,
        })
        .from(coffeeCultivar)
        .orderBy(asc(coffeeCultivar.value));
    case "country":
      return db
        .select({ value: country.value, comment: country.comment })
        .from(country)
        .orderBy(asc(country.value));
    case "sake_category":
      return db
        .select({ value: sakeCategory.value, comment: sakeCategory.comment })
        .from(sakeCategory)
        .orderBy(asc(sakeCategory.value));
    case "sake_rice_variety":
      return db
        .select({
          value: sakeRiceVariety.value,
          comment: sakeRiceVariety.comment,
        })
        .from(sakeRiceVariety)
        .orderBy(asc(sakeRiceVariety.value));
    case "sake_type":
      return db
        .select({ value: sakeType.value, comment: sakeType.comment })
        .from(sakeType)
        .orderBy(asc(sakeType.value));
    case "spirit_type":
      return db
        .select({ value: spiritType.value, comment: spiritType.comment })
        .from(spiritType)
        .orderBy(asc(spiritType.value));
    case "tea_category":
      return db
        .select({ value: teaCategory.value, comment: teaCategory.comment })
        .from(teaCategory)
        .orderBy(asc(teaCategory.value));
    case "wine_style":
      return db
        .select({ value: wineStyle.value, comment: wineStyle.comment })
        .from(wineStyle)
        .orderBy(asc(wineStyle.value));
    case "wine_variety":
      return db
        .select({ value: wineVariety.value, comment: wineVariety.comment })
        .from(wineVariety)
        .orderBy(asc(wineVariety.value));
  }
};
