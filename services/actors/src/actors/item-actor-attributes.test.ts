/**
 * Every attribute of every item type, round-tripped through the real
 * `ItemActor` and Postgres — generated from `ITEM_TYPE_SPECS`.
 *
 * `item-actor.test.ts`'s "the six item types round-trip through one actor"
 * creates one item per type and reads back its name: it round-trips **no
 * attribute at all**, so a binding to the wrong column, a rename written the
 * wrong way round, or a decimal that came back as a string would all pass it.
 * This file walks the spec instead, so a seventh type or a new attribute is
 * covered the moment it is declared:
 *
 *   1. `create` with the attribute set → `get` returns it, and the value sits
 *      in the column the spec names (`sakes.type` for `sakeType`), read with
 *      raw SQL rather than through the actor that wrote it;
 *   2. `update` to a second value → `get` returns that, and so does the column.
 *
 * Values are chosen per kind: two seeded rows of the attribute's reference
 * table, the first two labels of a static vocabulary, two dates, two years…
 */
import { randomUUID } from "node:crypto";
import {
  ITEM_TYPE_SPECS,
  ITEM_TYPES,
  type ItemAttributeSpec,
  type ItemType,
  itemAttributeEntries,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { ItemActor } from "./item-actor.ts";

const newItemActor = (id: string, db: DbOrTx): ItemActor =>
  new ItemActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(id),
    db,
    async () => {
      throw new Error("no FileActor in this test");
    },
    async () => {
      throw new Error("no EmbeddingActor in this test");
    },
  );

/** Two distinct legal values for one attribute: the created one, the updated one. */
const valuesFor = async (
  db: DbOrTx,
  attribute: ItemAttributeSpec,
): Promise<readonly [unknown, unknown]> => {
  const vocabulary = attribute.vocabulary;
  if (vocabulary?.kind === "reference") {
    const table = sql.identifier(vocabulary.reference);
    await db.execute(sql`
      insert into public.${table} (value)
      values ('ITEMSPEC_A'), ('ITEMSPEC_B') on conflict do nothing`);
    return ["ITEMSPEC_A", "ITEMSPEC_B"];
  }
  if (vocabulary?.kind === "static") {
    return [vocabulary.values[0], vocabulary.values[1]];
  }
  switch (attribute.kind) {
    case "text":
      return ["itemspec alpha", "itemspec beta"];
    case "date":
      return ["2021-03-04", "2022-05-06"];
    case "year":
      return [2019, 2020];
    case "integer":
      return [42, 43];
    case "decimal":
      return [12.5, 13.25];
    case "boolean":
      return [true, false];
  }
};

/** What the column holds, read around the actor. Numerics compared as numbers. */
const storedValue = async (
  db: DbOrTx,
  type: ItemType,
  id: string,
  attribute: ItemAttributeSpec,
): Promise<unknown> => {
  const { rows } = await db.execute<{ value: unknown }>(sql`
    select ${sql.identifier(attribute.column)} as value
      from public.${sql.identifier(ITEM_TYPE_SPECS[type].table)}
     where id = ${id}::uuid`);
  const value = rows[0]?.value;
  if (value === null || value === undefined) return null;
  if (attribute.kind === "decimal") return Number(value);
  if (attribute.kind === "date") {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);
  }
  return value;
};

/** The smallest create input the type accepts, before the attribute under test. */
const baseInput = async (
  db: DbOrTx,
  type: ItemType,
  userId: string,
): Promise<Record<string, unknown>> => {
  const spec = ITEM_TYPE_SPECS[type];
  const bag: Record<string, unknown> = {};
  for (const [key, attribute] of itemAttributeEntries(type)) {
    if (attribute.required) bag[key] = (await valuesFor(db, attribute))[0];
  }
  const input: Record<string, unknown> = {
    name: `itemspec ${type}`,
    [spec.bag]: bag,
  };
  if (spec.descriptionRequired) input.description = "itemspec description";
  if (spec.onboardingRequired) {
    const onboardingId = randomUUID();
    await db.execute(sql`
      insert into public.item_onboardings (id, user_id, item_type)
      values (${onboardingId}::uuid, ${userId}::uuid, ${type})`);
    input.itemOnboardingId = onboardingId;
  }
  return input;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ItemActor · every spec attribute round-trips", () => {
  afterAll(closeTestDb);

  for (const type of ITEM_TYPES) {
    const spec = ITEM_TYPE_SPECS[type];
    for (const [key, attribute] of itemAttributeEntries(type)) {
      it(`${type}.${key} ↔ ${spec.table}.${attribute.column}: create → get, update → get`, async () => {
        await withTestDb(async (db) => {
          const user = await seedUser(db);
          const ctx = userCtx(user, `itemspec-${type}-${key}`);
          const [created, updated] = await valuesFor(db, attribute);
          const input = await baseInput(db, type, user);
          const bag = input[spec.bag] as Record<string, unknown>;
          bag[key] = created;

          const id = randomUUID();
          const actor = await activate(
            newItemActor(`${type.toLowerCase()}:${id}`, db),
          );
          await actor.create(ctx, input as never);

          const afterCreate = (await actor.get(ctx)) as Record<string, unknown>;
          expect(afterCreate[key]).toEqual(created);
          expect(await storedValue(db, type, id, attribute)).toEqual(created);

          await actor.update(ctx, { [spec.bag]: { [key]: updated } });
          const afterUpdate = (await actor.get(ctx)) as Record<string, unknown>;
          expect(afterUpdate[key]).toEqual(updated);
          expect(await storedValue(db, type, id, attribute)).toEqual(updated);
        });
      });
    }
  }
});
