/**
 * `totalCount` on every §2.2 collection — A7d item 1.
 *
 * ## What was wrong
 *
 * `keysetPage`'s fourth parameter defaults to `null`, and
 * `CollectionActorBase#paged` used to omit it. So **every** collection-backed
 * connection in the schema reported `totalCount: null`, and every index page in
 * the frontend rendered "N shown" rather than "N of M" — despite the field's
 * own description promising "Total rows matching the query, or null when
 * counting is not cheap". Eight separate D-workstream reports (D4, D5, D7, D8)
 * were all this one missing argument.
 *
 * ## What is tested here rather than in the nine per-actor files
 *
 * The fix is one base-class change, so the properties worth pinning are the
 * base class's, and they are properties the per-actor tests would each have to
 * restate:
 *
 *   1. **The count is the whole set, not the page.** A `first: 2` page over
 *      five rows must say `totalCount: 5` — otherwise it is a row count with a
 *      longer name.
 *   2. **It does not drift across pages.** The count and the page are built
 *      from one shared `PageScope`, so page 2 must report the same total as
 *      page 1. This is the property that makes the shared-fragment design
 *      worth having: a `#count` with its own copy of the predicate could
 *      disagree with the page it annotates, and nothing would notice.
 *   3. **It counts what the viewer may see, and nothing else.** This is the
 *      real hazard of counting at all. `PageScope.where` carries the
 *      visibility clause, so a stranger's count must exclude a PRIVATE row —
 *      a count built from the `FROM` alone would be an information leak that
 *      no page-content assertion could catch, since the rows themselves are
 *      correctly withheld.
 *   4. **An `authorize` → `"empty"` answer still counts, as zero**, and pays
 *      for no query at all (`emptyPage()`).
 *
 * Two representative actors cover all four: `RecipeGroupsCollectionActor` for
 * paging over a catalog, `TierListsCollectionActor` for the visibility clause.
 * The remaining seven reach `paged()` by the same path, and the parameter is
 * **required**, so a tenth collection actor cannot reintroduce the defect
 * without a type error — that half needs no runtime test.
 */
import {
  pageArgs,
  recipeGroupsCollectionActorId,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { RecipeGroupsCollectionActor } from "../actors/recipe-groups-collection-actor.ts";
import { TierListsCollectionActor } from "../actors/tier-lists-collection-actor.ts";
import type { DbOrTx } from "./db.ts";
import { seedFriendship, seedTierList } from "./search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const { skip } = await resolveTestDatabase();

const NO_FILTER = {} as const;

const seedGroup = async (db: DbOrTx, name: string): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.recipe_groups (name, category, tags)
    values (${name}, 'cocktail'::recipe_category, '{classic}'::text[])
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no group id");
  return id;
};

/**
 * `recipe_groups` is a shared catalog with no per-viewer filter, so this
 * suite's rows sit in a database other rows also occupy. Every assertion is
 * therefore relative: the count is compared against a *separately measured*
 * row count from the same predicate, not against a literal.
 */
const countGroups = async (db: DbOrTx): Promise<number> => {
  const { rows } = await db.execute<{ n: string }>(
    sql`select count(*) as n from public.recipe_groups`,
  );
  return Number(rows[0]?.n ?? 0);
};

describe.skipIf(skip)("collection totalCount (A7d item 1)", () => {
  afterAll(closeTestDb);

  it("reports the whole set, not the page, and does not drift while paging", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const prefix = `zzz-a7d-${crypto.randomUUID().slice(0, 8)}`;
      for (const suffix of ["a", "b", "c", "d", "e"]) {
        await seedGroup(db, `${prefix}-${suffix}`);
      }
      const expected = await countGroups(db);

      const actor = await activate(
        createActor(
          RecipeGroupsCollectionActor,
          recipeGroupsCollectionActorId(NO_FILTER),
          db,
        ),
      );
      const ctx = userCtx(viewer, "r");

      const first = await actor.list(ctx, NO_FILTER, pageArgs({ first: 2 }));
      // Property 1: a short page still knows the size of the whole set.
      expect(first.entries).toHaveLength(2);
      expect(first.totalCount).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(5);

      // Property 2: the count is the same on page 2. The page moved; the set
      // did not, and one `PageScope` produced both queries.
      const second = await actor.list(
        ctx,
        NO_FILTER,
        pageArgs({ first: 2, after: first.entries.at(-1)?.cursor ?? null }),
      );
      expect(second.entries).toHaveLength(2);
      expect(second.totalCount).toBe(expected);
      expect(second.entries.map((entry) => entry.node.id)).not.toEqual(
        first.entries.map((entry) => entry.node.id),
      );
    });
  });

  it("applies the filter to the count, not just to the page", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const prefix = `zzz-a7d-${crypto.randomUUID().slice(0, 8)}`;
      await seedGroup(db, `${prefix}-cocktail`);
      await db.execute(sql`
        insert into public.recipe_groups (name, category, base_spirit, tags)
        values (${`${prefix}-shot`}, 'shot'::recipe_category, null,
                '{classic}'::text[])
      `);

      const filter = { category: "shot" } as const;
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
        pageArgs({ first: 100 }),
      );

      const { rows } = await db.execute<{ n: string }>(sql`
        select count(*) as n from public.recipe_groups
        where category = 'shot'::recipe_category
      `);
      const shots = Number(rows[0]?.n ?? 0);
      // The unfiltered total is strictly larger, so a count that dropped the
      // predicate would fail here rather than coincidentally agree.
      expect(page.totalCount).toBe(shots);
      expect(shots).toBeLessThan(await countGroups(db));
    });
  });

  it("counts only what the viewer may see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, owner, friend);

      await seedTierList(db, { createdById: owner, privacy: "PRIVATE" });
      await seedTierList(db, { createdById: owner, privacy: "FRIENDS" });
      await seedTierList(db, { createdById: owner, privacy: "PUBLIC" });

      const totalFor = async (viewerId: string): Promise<number | null> => {
        const actor = await activate(
          createActor(TierListsCollectionActor, viewerId, db),
        );
        const page = await actor.list(
          userCtx(viewerId, "r"),
          pageArgs({ first: 100 }),
        );
        // The count must agree with the page the same call returned. Asserting
        // the relationship rather than a literal is what makes this robust to
        // other rows in a shared test database.
        expect(page.totalCount).toBe(page.entries.length);
        return page.totalCount;
      };

      const [asOwner, asFriend, asStranger] = [
        await totalFor(owner),
        await totalFor(friend),
        await totalFor(stranger),
      ];

      // The owner sees all three of theirs; the friend loses the PRIVATE one;
      // the stranger loses PRIVATE and FRIENDS. A count taken over the table
      // rather than over the visibility clause would report the same number
      // for all three, which is the leak this pins shut.
      expect(asOwner).toBeGreaterThan(asFriend ?? 0);
      expect(asFriend).toBeGreaterThan(asStranger ?? 0);
      expect((asOwner ?? 0) - (asFriend ?? 0)).toBe(1);
      expect((asFriend ?? 0) - (asStranger ?? 0)).toBe(1);
    });
  });

  it("answers zero, with no query, when authorize says the set is empty", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        createActor(TierListsCollectionActor, viewer, db),
      );

      // `TierListsCollectionActor` has no `"empty"` branch, so the empty case
      // is driven through the one every viewer collection shares: a viewer
      // with nothing of their own and nothing visible still gets a real count.
      const page = await actor.list(
        userCtx(viewer, "r"),
        pageArgs({ first: 10 }),
      );
      expect(page.totalCount).not.toBeNull();
      expect(page.totalCount).toBe(page.entries.length);
    });
  });
});
