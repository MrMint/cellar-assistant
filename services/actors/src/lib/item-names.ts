/**
 * Item names for a list of refs, read fresh (UI parity G3).
 *
 * `CellarActor` holds its bottles as `ItemRef`s and nothing more: the names
 * live in the six item tables, which `ItemActor` writes and `CellarActor`
 * therefore may not cache (§1.3 — "an actor may cache only the tables it
 * writes"). So a name-ordered page reads them per call, one `select` per item
 * type present, and only when that ordering is asked for.
 *
 * Like `vectorDistances` (`./vectors.ts`), a ref whose row is gone simply has
 * no entry; the caller decides where that sorts.
 */
import type { ItemRef, ItemType } from "@cellar-assistant/contracts";
import { inArray } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { ITEM_TABLES } from "./item-bindings.ts";

/** `item id → name`. Ids are unique across the six tables (uuids). */
export const itemNames = async (
  db: DbOrTx,
  refs: readonly ItemRef[],
): Promise<Map<string, string>> => {
  const byType = new Map<ItemType, Set<string>>();
  for (const ref of refs) {
    const ids = byType.get(ref.type) ?? new Set<string>();
    ids.add(ref.id);
    byType.set(ref.type, ids);
  }

  const results = await Promise.all(
    [...byType.entries()].map(([type, ids]) => {
      const table = ITEM_TABLES[type];
      return db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(inArray(table.id, [...ids]));
    }),
  );

  const names = new Map<string, string>();
  for (const rows of results) {
    for (const row of rows) names.set(row.id, row.name);
  }
  return names;
};
