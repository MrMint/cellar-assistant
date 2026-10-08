/**
 * Writes the fixture catalog (`catalog.ts`) into a database handle — always a
 * `withTestDb` transaction, so nothing outlives the run.
 *
 * Items go in through `itemInsertValues`, the same mapping `ItemActor.create`
 * uses, so an attribute lands in the column production would put it in and
 * `embeddingTextFor` reads it back exactly as `regenerateVector` would. Brands
 * go into `brands` and `item_brands` the way `BrandRegistryActor` and
 * `ItemActor.linkBrand` leave them, primary first.
 *
 * Vectors are not written here: `writeItemVector` takes whatever vector the
 * harness's embedder produced, so the seed is model-agnostic.
 */
import { randomUUID } from "node:crypto";
import type {
  CreateItemInput,
  ItemRef,
  ItemType,
} from "@cellar-assistant/contracts";
import { ITEM_TYPE_SPECS } from "@cellar-assistant/contracts";
import { eq, sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "../../lib/db.ts";
import { ARCS } from "../../lib/item-arcs.ts";
import type { ItemRow } from "../../lib/item-bindings.ts";
import { ITEM_TABLES, itemInsertValues } from "../../lib/item-bindings.ts";
import { toVectorLiteral } from "../../lib/vectors.ts";
import type { CatalogEntry } from "./catalog.ts";

export type SeededItem = {
  readonly entry: CatalogEntry;
  readonly ref: ItemRef;
  /** The row as `ItemActor` would load it. */
  readonly row: ItemRow;
  /** Brand names linked to the item, primary first. */
  readonly brands: readonly string[];
};

export type SeededCatalog = {
  readonly items: readonly SeededItem[];
  /** Item id → catalog key, to turn a search hit back into a fixture key. */
  readonly keyOf: ReadonlyMap<string, string>;
};

export const seedCatalog = async (
  db: DbOrTx,
  createdById: string,
  catalog: readonly CatalogEntry[],
): Promise<SeededCatalog> => {
  const brandIds = new Map<string, string>();
  const brandId = async (name: string): Promise<string> => {
    const known = brandIds.get(name);
    if (known !== undefined) return known;
    const { rows } = await db.execute<{ id: string }>(sql`
      insert into public.brands (name) values (${name})
      on conflict ((lower(name))) do update set name = excluded.name
      returning id
    `);
    const id = rows[0]?.id;
    if (id === undefined) throw new Error(`brand ${name} was not written`);
    brandIds.set(name, id);
    return id;
  };

  const items: SeededItem[] = [];
  const keyOf = new Map<string, string>();
  for (const entry of catalog) {
    const ref: ItemRef = { type: entry.type, id: randomUUID() };
    const spec = ITEM_TYPE_SPECS[entry.type];
    const onboardingId = randomUUID();
    await db.execute(sql`
      insert into public.item_onboardings (id, user_id, item_type)
      values (${onboardingId}::uuid, ${createdById}::uuid, ${entry.type})
    `);
    const input = {
      name: entry.name,
      description: entry.description ?? null,
      country: entry.country ?? null,
      itemOnboardingId: onboardingId,
      [spec.bag]: entry.attributes,
    } as CreateItemInput;
    await insertItem(
      db,
      entry.type,
      itemInsertValues(entry.type, input, {
        id: ref.id,
        name: entry.name,
        createdById,
      }),
    );
    const brands = entry.brands ?? [];
    for (const [index, name] of brands.entries()) {
      await db.execute(sql`
        insert into public.item_brands (brand_id, is_primary, ${ARCS.itemBrands.unqualified(ref.type)})
        values (${await brandId(name)}::uuid, ${index === 0}, ${ref.id}::uuid)
      `);
    }
    const table = ITEM_TABLES[entry.type];
    const [row] = await db.select().from(table).where(eq(table.id, ref.id));
    if (row === undefined) throw new Error(`item ${entry.key} was not written`);
    items.push({ entry, ref, row: row as ItemRow, brands });
    keyOf.set(ref.id, entry.key);
  }
  return { items, keyOf };
};

/** One insert into the item's own table; the union is too wide for Drizzle's types. */
const insertItem = async (
  db: DbOrTx,
  type: ItemType,
  values: object,
): Promise<void> => {
  const table = ITEM_TABLES[type] as (typeof ITEM_TABLES)["WINE"];
  await db.insert(table).values(values as typeof table.$inferInsert);
};

/** The item's one `item_vectors` row, as `regenerateVector` would upsert it. */
export const writeItemVector = async (
  db: DbOrTx,
  ref: ItemRef,
  vector: readonly number[],
  embeddingModel: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_vectors (${ARCS.itemVectors.unqualified(ref.type)}, vector, embedding_model, embedding_images)
    values (${ref.id}::uuid, ${toVectorLiteral(vector)}::halfvec, ${embeddingModel}, 'none')
  `);
};
