/**
 * `RecipeGroupsCollectionActor` — C3 (§2.2, §1.5, §1.6).
 *
 * The other catalog collection. Same three properties as the brand index —
 * projection, keyed by filter, catalog visibility per turn — plus the one thing
 * that is specific to it: `recipeCount` is an aggregate the projection carries,
 * which is why hydrating twenty `RecipeGroupActor` activations per page would
 * be the wrong answer here. And its order: newest first by default, as the
 * old page was (UI parity #15), or by name on request.
 */
import {
  anonymousCtx,
  ForbiddenError,
  pageArgs,
  recipeGroupsCollectionActorId,
  recipeIngredientUsesActorId,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedRecipe, seedWine } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { RecipeGroupsCollectionActor } from "./recipe-groups-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedGroup = async (
  db: DbOrTx,
  input: {
    readonly name: string;
    readonly category?: "cocktail" | "mocktail" | "other" | "punch" | "shot";
    readonly baseSpirit?: string | null;
  },
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.recipe_groups (name, category, base_spirit, tags)
    values (${input.name}, ${input.category ?? "cocktail"}::recipe_category,
            ${input.baseSpirit ?? null}, '{classic}'::text[])
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no group id");
  return id;
};

const NO_FILTER = {} as const;
const BY_NAME = { orderBy: "NAME" } as const;

const walk = async (
  actor: RecipeGroupsCollectionActor,
  ctx: ReturnType<typeof userCtx>,
  filter: Parameters<RecipeGroupsCollectionActor["list"]>[1],
  keep: (name: string) => boolean,
) => {
  const found: { name: string; recipeCount: number }[] = [];
  let after: string | null = null;
  for (let hop = 0; hop < 200; hop += 1) {
    const page = await actor.list(ctx, filter, pageArgs({ first: 100, after }));
    for (const entry of page.entries) {
      if (keep(entry.node.name)) {
        found.push({
          name: entry.node.name,
          recipeCount: entry.node.recipeCount,
        });
      }
    }
    if (!page.hasNextPage) break;
    after = page.entries.at(-1)?.cursor ?? null;
  }
  return found;
};

describe.skipIf(skip)("RecipeGroupsCollectionActor", () => {
  afterAll(closeTestDb);

  it("returns the projection with its recipe count, alphabetically under orderBy NAME", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const prefix = `zzz-c3-${crypto.randomUUID().slice(0, 8)}`;
      const negroni = await seedGroup(db, {
        name: `${prefix}-negroni`,
        baseSpirit: "gin",
      });
      await seedGroup(db, { name: `${prefix}-daiquiri`, baseSpirit: "rum" });
      const recipe = await seedRecipe(db, { name: `${prefix} v1` });
      await db.execute(sql`
        update public.recipes set recipe_group_id = ${negroni}::uuid
        where id = ${recipe}::uuid
      `);

      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(BY_NAME),
          db,
        ),
      );
      const found = await walk(actor, userCtx(viewer, "r"), BY_NAME, (name) =>
        name.startsWith(prefix),
      );
      expect(found).toEqual([
        { name: `${prefix}-daiquiri`, recipeCount: 0 },
        { name: `${prefix}-negroni`, recipeCount: 1 },
      ]);
    });
  });

  it("term (UI parity G26) narrows by group name, description or a version's name, case-insensitively, keeping order and totals", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const tag = crypto.randomUUID().slice(0, 8);
      const byName = await seedGroup(db, { name: `Negroni ${tag}` });
      const byDescription = await seedGroup(db, { name: `Americano ${tag}x` });
      await db.execute(sql`
        update public.recipe_groups
        set description = ${`a cousin of the BOULEVARDIER-${tag}`}
        where id = ${byDescription}::uuid
      `);
      const byVersion = await seedGroup(db, { name: `Spritz ${tag}y` });
      const recipe = await seedRecipe(db, { name: `Boulevardier-${tag} v2` });
      await db.execute(sql`
        update public.recipes set recipe_group_id = ${byVersion}::uuid
        where id = ${recipe}::uuid
      `);
      await seedGroup(db, { name: `Unrelated ${tag}z` });

      const filter = {
        term: `  boulevardier-${tag} `,
        orderBy: "NAME",
      } as const;
      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(filter),
          db,
        ),
      );
      const page = await actor.list(
        userCtx(viewer, "r"),
        filter,
        pageArgs({ first: 10 }),
      );
      // Alphabetical, as under NAME without a term; the total counts the
      // matches only.
      expect(page.entries.map((entry) => entry.node.id)).toEqual([
        byDescription,
        byVersion,
      ]);
      expect(page.totalCount).toBe(2);

      const nameFilter = { term: `NEGRONI ${tag}` };
      const nameActor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(nameFilter),
          db,
        ),
      );
      const names = await nameActor.list(
        userCtx(viewer, "r"),
        nameFilter,
        pageArgs({ first: 10 }),
      );
      expect(names.entries.map((entry) => entry.node.id)).toEqual([byName]);
    });
  });

  it("term treats % and _ as literals, is part of the key, and blank means no filter", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const tag = crypto.randomUUID().slice(0, 8);
      await seedGroup(db, { name: `Pct ${tag} 100% agave` });
      await seedGroup(db, { name: `Pct ${tag} 1000 agave` });

      const filter = { term: `${tag} 100%` };
      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(filter),
          db,
        ),
      );
      const page = await actor.list(
        userCtx(viewer, "r"),
        filter,
        pageArgs({ first: 10 }),
      );
      expect(page.entries.map((entry) => entry.node.name)).toEqual([
        `Pct ${tag} 100% agave`,
      ]);

      // The activation addressed for one term cannot be driven with another.
      await expect(
        actor.list(
          userCtx(viewer, "r"),
          { term: `${tag} 1000` },
          pageArgs({ first: 10 }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      // Blank and absent address the same activation as no term at all.
      expect(recipeGroupsCollectionActorId({ term: "   " })).toBe(
        recipeGroupsCollectionActorId(NO_FILTER),
      );
      // Over-long is refused before the database.
      const long = { term: "x".repeat(201) };
      const longActor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(long),
          db,
        ),
      );
      await expect(
        longActor.list(userCtx(viewer, "r"), long, pageArgs({ first: 1 })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(longActor.queryCount).toBe(0);
      // Anonymous is refused, term or not.
      await expect(
        actor.list(anonymousCtx("r"), filter, pageArgs({ first: 1 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("orders newest first by default (UI parity #15): ties by id, no created_at last, keyset pages without skips or repeats", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const tag = `newest-${crypto.randomUUID().slice(0, 8)}`;
      const at = async (name: string, createdAt: string | null) => {
        const id = await seedGroup(db, { name: `${tag} ${name}` });
        await db.execute(sql`
          update public.recipe_groups
          set created_at = ${createdAt}::timestamptz
          where id = ${id}::uuid
        `);
        return id;
      };
      // One microsecond apart: a cursor cut to milliseconds (the DTO's
      // `createdAt`) would put both on the same side of every page boundary.
      const newest = await at("a", "2999-01-01 00:00:00.000002+00");
      const next = await at("d", "2999-01-01 00:00:00.000001+00");
      // Created in the same instant — a seed, or one transaction's `now()`.
      const tiedA = await at("b", "2998-06-01 00:00:00+00");
      const tiedB = await at("e", "2998-06-01 00:00:00+00");
      const undated = await at("c", null);
      const tied = [tiedA, tiedB].sort().reverse();

      const filter = { term: tag };
      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(filter),
          db,
        ),
      );
      const ctx = userCtx(viewer, "r");
      const ids: string[] = [];
      let after: string | null = null;
      for (let hop = 0; hop < 10; hop += 1) {
        const page = await actor.list(
          ctx,
          filter,
          pageArgs({ first: 1, after }),
        );
        expect(page.totalCount).toBe(5);
        ids.push(...page.entries.map((entry) => entry.node.id));
        if (!page.hasNextPage) break;
        after = page.entries.at(-1)?.cursor ?? null;
      }
      expect(ids).toEqual([newest, next, ...tied, undated]);

      // Omitted and NEWEST are one order and one activation.
      expect(
        recipeGroupsCollectionActorId({ ...filter, orderBy: "NEWEST" }),
      ).toBe(recipeGroupsCollectionActorId(filter));

      // NAME is still there, on its own activation.
      const byName = { ...filter, orderBy: "NAME" } as const;
      expect(recipeGroupsCollectionActorId(byName)).not.toBe(
        recipeGroupsCollectionActorId(filter),
      );
      const nameActor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(byName),
          db,
        ),
      );
      const named = await nameActor.list(ctx, byName, pageArgs({ first: 10 }));
      expect(named.entries.map((entry) => entry.node.name)).toEqual(
        ["a", "b", "c", "d", "e"].map((name) => `${tag} ${name}`),
      );

      // A cursor minted under NAME is refused under NEWEST, as a validation
      // error rather than a failed `::timestamptz` cast in Postgres.
      const nameCursor = named.entries[0]?.cursor ?? null;
      expect(nameCursor).not.toBeNull();
      await expect(
        actor.list(ctx, filter, pageArgs({ first: 1, after: nameCursor })),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("filters by category, and the filter is part of the key", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const prefix = `zzz-c3-${crypto.randomUUID().slice(0, 8)}`;
      await seedGroup(db, { name: `${prefix}-shot`, category: "shot" });
      await seedGroup(db, { name: `${prefix}-cocktail` });

      const filter = { category: "shot" } as const;
      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(filter),
          db,
        ),
      );
      const found = await walk(actor, userCtx(viewer, "r"), filter, (name) =>
        name.startsWith(prefix),
      );
      expect(found.map((row) => row.name)).toEqual([`${prefix}-shot`]);

      // A different filter on this activation is refused, not re-run: the id
      // *is* the scope (§1.5, `SearchActorBase`'s rule applied to a catalog).
      await expect(
        actor.list(userCtx(viewer, "r"), NO_FILTER, pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("refuses anonymous on a warm activation (§1.5, C1)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedGroup(db, {
        name: `zzz-c3-${crypto.randomUUID().slice(0, 8)}`,
      });
      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(NO_FILTER),
          db,
        ),
      );
      const warm = await actor.list(
        userCtx(viewer, "r"),
        NO_FILTER,
        pageArgs({ first: 5 }),
      );
      expect(warm.entries.length).toBeGreaterThan(0);
      await expect(
        actor.list(anonymousCtx("r"), NO_FILTER, pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });

  /**
   * UI parity G11 — the item page's "Used in Recipes", an unrecorded drop:
   * the rows naming each item, by recipe name, for a page of items at once.
   */
  it("ingredientUses: rows per item by recipe name, aligned, keyed by the ref set", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const used = await seedWine(db, viewer, "zzz-g11 used");
      const unused = await seedWine(db, viewer, "zzz-g11 unused");
      const later = await seedRecipe(db, { name: "zzz-g11 b sangria" });
      const earlier = await seedRecipe(db, { name: "zzz-g11 a kalimotxo" });
      for (const recipeId of [later, earlier]) {
        await db.execute(sql`
          insert into public.recipe_ingredients (recipe_id, wine_id, quantity, unit)
          values (${recipeId}::uuid, ${used.id}::uuid, 2, 'oz')
        `);
      }
      const filter = { refs: [unused, used] };
      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeIngredientUsesActorId(filter),
          db,
        ),
      );
      const [none, some] = await actor.ingredientUses(
        userCtx(viewer, "r"),
        filter,
      );
      expect(none).toEqual({ nodes: [], totalCount: 0 });
      expect(some?.totalCount).toBe(2);
      expect(some?.nodes.map((n) => n.recipeId)).toEqual([earlier, later]);
      expect(some?.nodes[0]).toMatchObject({
        ref: used,
        quantity: 2,
        unit: "oz",
        isOptional: false,
      });
      expect(actor.queryCount).toBe(1);

      await expect(
        actor.ingredientUses(userCtx(viewer, "r"), { refs: [used] }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.ingredientUses(anonymousCtx("r"), filter),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });
});
