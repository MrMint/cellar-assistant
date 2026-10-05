/**
 * `resolveTierListEntries` — B7b, against real Postgres.
 *
 * This module is the whole of what B7b bought: the insights prompt used to
 * render every ranked row as the bare word `place`, and the six fields it asks
 * the model for are all claims about what was ranked. So what is asserted here
 * is **substance** — that a resolved entry carries the things the old Nhost
 * prompt consumed (name, categories, location, editorial summary, public
 * rating, price level) and that an item carries its closed-vocabulary columns.
 *
 * The item half is driven from `CONSTRAINED_ITEM_ATTRIBUTES` rather than from a
 * list typed out here, for the reason X1b's picker failed: a hand-copied domain
 * silently ships a subset. Every declared attribute of every one of the six
 * types is seeded and then demanded back, so adding an eleventh reference table
 * to that map either widens this descriptor or fails this test.
 */
import { randomUUID } from "node:crypto";
import type { ItemType } from "@cellar-assistant/contracts";
import { ITEM_TYPES } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { CONSTRAINED_ITEM_ATTRIBUTES } from "./ai/vocabulary.ts";
import type { DbOrTx } from "./db.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";
import {
  entryKey,
  isSubstantive,
  requireGroundedEntries,
  resolveTierListEntries,
} from "./tier-list-entries.ts";

const { skip } = await resolveTestDatabase();

/** The table each item type lives in — the same map the module under test has. */
const ITEM_TABLE: Readonly<Record<ItemType, string>> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

/**
 * Columns a type needs that no constrained attribute covers.
 *
 * `NOT NULL` with no default, straight from `information_schema`: `wines`
 * wants a vintage, `coffees` a description, and four of the six want an
 * onboarding row. `region` is here because it is the one free-text column the
 * descriptor folds into `location`, and only three types have it.
 */
const EXTRA_COLUMNS: Readonly<
  Record<ItemType, Readonly<Record<string, string>>>
> = {
  WINE: { vintage: "2019-01-01", region: "Margaret River" },
  BEER: {},
  SPIRIT: {},
  COFFEE: { description: "A coffee." },
  SAKE: { region: "Niigata" },
  TEA: { region: "Uji" },
};

const NEEDS_ONBOARDING: Readonly<Record<ItemType, boolean>> = {
  WINE: true,
  BEER: true,
  SPIRIT: true,
  COFFEE: true,
  SAKE: false,
  TEA: false,
};

/** A value for one constrained column, seeding its reference table if needed. */
const constrainedValue = async (
  db: DbOrTx,
  source: (typeof CONSTRAINED_ITEM_ATTRIBUTES)[ItemType][number]["source"],
  seed: string,
): Promise<string> => {
  if (source.kind === "static") {
    const first = source.values[0];
    if (first === undefined) throw new Error("a static enum with no members");
    return first;
  }
  // A synthetic row rather than a real one: these tables are shared with every
  // other suite in this database, and what matters is that the foreign key
  // resolves, not which label it resolves to.
  const value = `zzz-b7b-${seed}`;
  await db.execute(
    sql`insert into ${sql.raw(`public.${source.reference}`)} (value)
        values (${value}) on conflict do nothing`,
  );
  return value;
};

const seedItem = async (
  db: DbOrTx,
  type: ItemType,
  createdById: string,
  name: string,
): Promise<{ id: string; values: Record<string, string> }> => {
  const columns: Record<string, string> = { ...EXTRA_COLUMNS[type] };
  const values: Record<string, string> = {};

  for (const attribute of CONSTRAINED_ITEM_ATTRIBUTES[type]) {
    const column = attribute.column.split(".")[1] ?? "";
    const value = await constrainedValue(
      db,
      attribute.source,
      `${type}-${attribute.field}`.toLowerCase(),
    );
    columns[column] = value;
    values[attribute.field] = value;
  }

  const id = randomUUID();
  const names = ["id", "name", "created_by_id"];
  const literals = [sql`${id}::uuid`, sql`${name}`, sql`${createdById}::uuid`];

  if (NEEDS_ONBOARDING[type]) {
    const onboardingId = randomUUID();
    await db.execute(sql`
      insert into public.item_onboardings (id, user_id, item_type)
      values (${onboardingId}::uuid, ${createdById}::uuid, ${type})
    `);
    names.push("item_onboarding_id");
    literals.push(sql`${onboardingId}::uuid`);
  }

  for (const [column, value] of Object.entries(columns)) {
    names.push(column);
    literals.push(sql`${value}`);
  }

  await db.execute(sql`
    insert into ${sql.raw(`public.${ITEM_TABLE[type]}`)}
      (${sql.raw(names.join(", "))})
    values (${sql.join(literals, sql`, `)})
  `);
  return { id, values };
};

const seedPlace = async (
  db: DbOrTx,
  overrides: {
    displayName?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    priceLevel?: number | null;
    description?: string | null;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.places
      (id, name, display_name, categories, location, source, locality, region,
       country_code, rating, review_count, price_level, description)
    values (
      ${id}::uuid, 'Overture Name', ${overrides.displayName ?? null},
      ARRAY['wine_bar', 'restaurant', 'bar', 'nightlife', 'ignored']::text[],
      ST_SetSRID(ST_MakePoint(-97.7431, 30.2672), 4326)::geography,
      'overture', 'Austin', 'Texas', 'US',
      ${overrides.rating ?? null}, ${overrides.reviewCount ?? null},
      ${overrides.priceLevel ?? null}, ${overrides.description ?? null}
    )
  `);
  return id;
};

describe.skipIf(skip)("resolveTierListEntries (B7b)", () => {
  afterAll(closeTestDb);

  it("describes a place with everything the old prompt consumed", async () => {
    await withTestDb(async (db) => {
      const id = await seedPlace(db, {
        displayName: "The Aviary",
        rating: 4.2,
        reviewCount: 311,
        priceLevel: 2,
        description: "An Overture blurb.",
      });
      const resolved = await resolveTierListEntries(db, [
        { type: "PLACE", id },
      ]);
      const entry = resolved.get(entryKey({ type: "PLACE", id }));

      expect(entry?.name).toBe("The Aviary");
      // Four categories, not five: the prompt gets a signal, not a tag dump.
      expect(entry?.attributes).toEqual([
        { label: "category", value: "wine_bar" },
        { label: "category", value: "restaurant" },
        { label: "category", value: "bar" },
        { label: "category", value: "nightlife" },
      ]);
      expect(entry?.location).toBe("Austin, Texas, US");
      expect(entry?.summary).toBe("An Overture blurb.");
      expect(entry?.publicRating).toBeCloseTo(4.2, 5);
      expect(entry?.publicRatingCount).toBe(311);
      expect(entry?.priceLevel).toBe(2);
    });
  });

  it("prefers Google's enrichment over the Overture columns", async () => {
    await withTestDb(async (db) => {
      const id = await seedPlace(db, {
        rating: 4.2,
        reviewCount: 311,
        priceLevel: 2,
        description: "An Overture blurb.",
      });
      await db.execute(sql`
        insert into public.place_google_enrichments
          (place_id, google_place_id, google_rating, google_user_ratings_total,
           google_price_level, google_editorial_summary, resolved_via)
        values (${id}::uuid, ${`g-${id}`}, 4.7, 12000, 3,
                'Known for natural wine and a very short menu.', 'text_search')
      `);
      const entry = (
        await resolveTierListEntries(db, [{ type: "PLACE", id }])
      ).get(entryKey({ type: "PLACE", id }));

      // "What these places are known for" is the block the old prompt leant on
      // hardest, and the editorial summary is where it came from.
      expect(entry?.summary).toBe(
        "Known for natural wine and a very short menu.",
      );
      expect(entry?.publicRating).toBeCloseTo(4.7, 5);
      expect(entry?.publicRatingCount).toBe(12000);
      expect(entry?.priceLevel).toBe(3);
      // `display_name` was null, so the Overture name is what is left.
      expect(entry?.name).toBe("Overture Name");
    });
  });

  it.each(
    ITEM_TYPES,
  )("describes a %s with every attribute its vocabulary declares", async (type) => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const { id, values } = await seedItem(db, type, owner, `zzz-b7b ${type}`);
      const entry = (await resolveTierListEntries(db, [{ type, id }])).get(
        entryKey({ type, id }),
      );

      expect(entry?.name).toBe(`zzz-b7b ${type}`);

      // The domain, taken from the map rather than copied: every constrained
      // field except `country`, which is folded into `location` instead of
      // being repeated as an attribute.
      const expected = CONSTRAINED_ITEM_ATTRIBUTES[type]
        .filter((attribute) => attribute.field !== "country")
        .map((attribute) => ({
          label: attribute.field,
          value: values[attribute.field] ?? "",
        }));
      expect(entry?.attributes).toEqual(expected);

      // `country` is not lost — it is the tail of the location string.
      expect(entry?.location).toContain(values.country ?? "");
      const region = EXTRA_COLUMNS[type].region;
      if (region !== undefined) expect(entry?.location).toContain(region);

      // Items carry no crowd consensus in this schema, and saying so is the
      // point: `check_ins` are personal scores, not a public rating.
      expect(entry?.publicRating).toBeNull();
      expect(entry?.priceLevel).toBeNull();
    });
  });

  it("batches by type — a mixed list resolves in one pass", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const wine = await seedItem(db, "WINE", owner, "zzz-b7b mixed wine");
      const tea = await seedItem(db, "TEA", owner, "zzz-b7b mixed tea");
      const place = await seedPlace(db, { displayName: "Mixed Bar" });

      const resolved = await resolveTierListEntries(db, [
        { type: "WINE", id: wine.id },
        { type: "PLACE", id: place },
        { type: "TEA", id: tea.id },
      ]);
      expect([...resolved.keys()].sort()).toEqual(
        [
          entryKey({ type: "WINE", id: wine.id }),
          entryKey({ type: "PLACE", id: place }),
          entryKey({ type: "TEA", id: tea.id }),
        ].sort(),
      );
    });
  });

  it("leaves an unreadable entry out of the map rather than failing", async () => {
    await withTestDb(async (db) => {
      const missing = randomUUID();
      const resolved = await resolveTierListEntries(db, [
        { type: "PLACE", id: missing },
      ]);
      // A torn read, not an expected state — every entry column on
      // `tier_list_items` is an FK with no `on delete`. The caller renders it
      // as unresolved instead of losing the whole generation.
      expect(resolved.size).toBe(0);
    });
  });
});

describe("the abstention gate (B7b)", () => {
  const bare = { name: null, notes: null, attributes: [] };

  it("counts a name, a note or one attribute as substance", () => {
    expect(isSubstantive(bare)).toBe(false);
    expect(isSubstantive({ ...bare, name: "The Aviary" })).toBe(true);
    expect(isSubstantive({ ...bare, notes: "the one by the river" })).toBe(
      true,
    );
    expect(
      isSubstantive({
        ...bare,
        attributes: [{ label: "style", value: "RED" }],
      }),
    ).toBe(true);
  });

  it("refuses a list of entries that resolved to nothing", () => {
    expect(() => requireGroundedEntries([bare, bare, bare])).toThrow(
      /only 0 that carry a name/,
    );
  });

  it("passes a list of three describable entries", () => {
    const named = [1, 2, 3].map((n) => ({ ...bare, name: `entry ${n}` }));
    expect(() => requireGroundedEntries(named)).not.toThrow();
  });
});
