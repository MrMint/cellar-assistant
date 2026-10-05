import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { tables } from "./index.ts";
import { relations } from "./relations.ts";

/**
 * `defineRelations` only resolves its references when the relations object is
 * built, so a dangling table reference or an alias with no counterpart surfaces
 * at import time rather than at compile time. The recon findings
 * (`docs/architecture/findings/drizzle-rc-pull.md` Q1) hit exactly that: a
 * `public`-only pull produced a `relations.ts` that threw on import. These tests
 * are the guard, and they are what makes the hand-audited `.through()` edits
 * safe to re-do.
 */
describe("RQB v2 relations", () => {
  const byTableName = new Map<string, { relations: Record<string, unknown> }>(
    Object.values(relations).map((entry) => [
      String(getTableName(entry.table)),
      entry as unknown as { relations: Record<string, unknown> },
    ]),
  );

  it("builds without throwing", () => {
    expect(byTableName.size).toBeGreaterThan(0);
  });

  it("has an entry for every application table", () => {
    const missing = Object.keys(tables).filter(
      (name) => !byTableName.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("gives the audited junction tables their own many-to-one relations", () => {
    // Every one of these was collapsed into a `.through()` many-to-many by
    // `drizzle-kit pull` and left with no relations of its own.
    for (const table of [
      "cellar_owners",
      "check_ins",
      "friends",
      "friend_requests",
      "menu_item_recipes",
      "place_brands",
      "place_google_photos",
      "recipe_groups",
      "recipe_reviews",
      "recipe_votes",
      "user_place_interactions",
    ]) {
      const entry = byTableName.get(table);
      expect(Object.keys(entry?.relations ?? {}).length).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});
