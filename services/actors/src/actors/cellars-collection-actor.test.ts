/**
 * `CellarsCollectionActor` — C3 (§2.2, §1.5, §1.6).
 *
 * Three things: the §1.6 owner / friend / stranger trio (plus the co-owner
 * branch a cellar has and a tier list does not), the keyset page-walk, and the
 * two rules C1 and C2 paid for — authorization on **every** turn of a warm
 * activation, and a viewer-keyed actor refusing a caller who is not that
 * viewer.
 */
import { randomUUID } from "node:crypto";
import {
  ForbiddenError,
  type PermissionType,
  pageArgs,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { canSeeCellar } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellarItem,
  seedBeer as seedNamedBeer,
  seedWine as seedNamedWine,
  seedCellar as seedOwnedCellar,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { CellarsCollectionActor } from "./cellars-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null) => ({
  viewerId,
  kind: "user" as const,
  requestId: `req-${Math.random()}`,
});

const seedCellar = async (
  db: DbOrTx,
  createdById: string,
  privacy: PermissionType,
  name = "c",
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.cellars (name, created_by_id, privacy)
    values (${name}, ${createdById}::uuid, ${privacy}::permission_type)
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no cellar id");
  return id;
};

const befriend = async (db: DbOrTx, a: string, b: string): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${a}::uuid, ${b}::uuid) on conflict do nothing
  `);
};

const listIds = async (
  db: DbOrTx,
  viewerId: string,
  first = 50,
): Promise<string[]> => {
  const actor = await activate(
    createActor(CellarsCollectionActor, viewerId, db),
  );
  const page = await actor.list(userCtx(viewerId), pageArgs({ first }));
  return page.entries.map((entry) => entry.node);
};

describe.skipIf(skip)("CellarsCollectionActor", () => {
  afterAll(closeTestDb);

  it("matches canSeeCellar for owner, co-owner, friend and stranger", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const coOwner = await seedUser(db);
      const stranger = await seedUser(db);
      await befriend(db, owner, friend);

      const priv = await seedCellar(db, owner, "PRIVATE");
      const friends = await seedCellar(db, owner, "FRIENDS");
      const pub = await seedCellar(db, owner, "PUBLIC");
      await db.execute(sql`
        insert into public.cellar_owners (user_id, cellar_id)
        values (${coOwner}::uuid, ${priv}::uuid)
      `);

      const seen = {
        owner: await listIds(db, owner),
        friend: await listIds(db, friend),
        coOwner: await listIds(db, coOwner),
        stranger: await listIds(db, stranger),
      };

      expect(seen.owner).toEqual(expect.arrayContaining([priv, friends, pub]));
      expect(seen.friend).toEqual(expect.arrayContaining([friends, pub]));
      expect(seen.friend).not.toContain(priv);
      expect(seen.coOwner).toContain(priv);
      expect(seen.stranger).toContain(pub);
      expect(seen.stranger).not.toContain(priv);
      expect(seen.stranger).not.toContain(friends);

      // The SQL is a transcription of the policy function; assert the two
      // agree rather than trusting the transcription by eye.
      for (const [cellarId, privacy] of [
        [priv, "PRIVATE"],
        [friends, "FRIENDS"],
        [pub, "PUBLIC"],
      ] as const) {
        for (const [who, viewerId, isFriendOfOwner, coOwnerIds] of [
          ["owner", owner, false, []],
          ["friend", friend, true, []],
          ["coOwner", coOwner, false, [coOwner]],
          ["stranger", stranger, false, []],
        ] as const) {
          const policy = canSeeCellar(userCtx(viewerId), {
            createdById: owner,
            privacy,
            coOwnerIds: cellarId === priv ? [...coOwnerIds] : [],
            viewerIsFriendOfCreator: isFriendOfOwner,
          });
          expect(
            seen[who as keyof typeof seen].includes(cellarId),
            `${who} / ${privacy}`,
          ).toBe(policy);
        }
      }
    });
  });

  it("pages by keyset and never re-reads a row", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const ids: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        ids.push(await seedCellar(db, owner, "PRIVATE", `c${index}`));
      }
      const actor = await activate(
        createActor(CellarsCollectionActor, owner, db),
      );
      const ctx = userCtx(owner);

      const first = await actor.list(ctx, pageArgs({ first: 2 }));
      expect(first.entries).toHaveLength(2);
      expect(first.hasNextPage).toBe(true);

      const second = await actor.list(
        ctx,
        pageArgs({ first: 2, after: first.entries[1]?.cursor }),
      );
      const third = await actor.list(
        ctx,
        pageArgs({ first: 2, after: second.entries[1]?.cursor }),
      );

      const walked = [
        ...first.entries,
        ...second.entries,
        ...third.entries,
      ].map((entry) => entry.node);
      expect(new Set(walked).size).toBe(5);
      expect([...walked].sort()).toEqual([...ids].sort());
      expect(third.hasNextPage).toBe(false);

      // §1.1/§1.3: a collection actor holds nothing, so every turn queries.
      expect(actor.queryCount).toBe(3);
    });
  });

  /**
   * Decision D13: yours first, then everyone else's, each by most recent
   * activity — not by creation. Timestamps are written explicitly, because
   * every row in one test transaction would otherwise share one `now()`.
   */
  it("orders your cellars first, each group by most recent activity (D13)", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const stranger = await seedUser(db);
      const at = (day: number) =>
        `2026-01-${String(day).padStart(2, "0")}T12:00:00Z`;
      const created = async (
        by: string,
        privacy: PermissionType,
        day: number,
      ): Promise<string> => {
        const id = await seedCellar(db, by, privacy);
        await db.execute(sql`
          update public.cellars set created_at = ${at(day)}::timestamptz
          where id = ${id}::uuid
        `);
        return id;
      };
      const { rows: wineRows } = await db.execute<{ id: string }>(sql`
        insert into public.item_onboardings (user_id, item_type)
        values (${me}::uuid, 'WINE') returning id
      `);
      await db.execute(
        sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
      );
      const { rows: wines } = await db.execute<{ id: string }>(sql`
        insert into public.wines (name, created_by_id, vintage, style, item_onboarding_id)
        values ('w', ${me}::uuid, '2020-01-01', 'RED', ${wineRows[0]?.id}::uuid)
        returning id
      `);
      const wine = wines[0]?.id ?? "";

      // Created newest-first: c (day 5), b (day 3), a (day 1).
      const a = await created(me, "PRIVATE", 1);
      const b = await created(me, "PRIVATE", 3);
      const c = await created(me, "PRIVATE", 5);
      // A stranger's PUBLIC cellar with the newest activity of all.
      const theirs = await created(stranger, "PUBLIC", 9);

      // `a` got a bottle on day 7 — the newest activity of mine. The
      // `updated_at` trigger is BEFORE UPDATE, so values given on insert stick.
      const bottleOn = async (cellarId: string, day: number) => {
        const { rows } = await db.execute<{ id: string }>(sql`
          insert into public.cellar_items (cellar_id, created_by, wine_id, created_at, updated_at)
          values (${cellarId}::uuid, ${me}::uuid, ${wine}::uuid,
                  ${at(day)}::timestamptz, ${at(day)}::timestamptz)
          returning id
        `);
        return rows[0]?.id ?? "";
      };
      await bottleOn(a, 7);
      // `b`'s bottle is old (day 2), but it had a check-in on day 6.
      const bBottle = await bottleOn(b, 2);
      const checkInId = randomUUID();
      await db.execute(sql`
        insert into public.check_ins
          (id, user_id, created_by_id, group_id, cellar_item_id, wine_id, created_at)
        values (${checkInId}::uuid, ${me}::uuid, ${me}::uuid, ${checkInId}::uuid,
                ${bBottle}::uuid, ${wine}::uuid, ${at(6)}::timestamptz)
      `);

      // a (7) > b (6) > c (5, created), then the stranger's despite day 9.
      expect(await listIds(db, me)).toEqual([a, b, c, theirs]);

      // The keyset cursor walks the same order a page at a time.
      const actor = await activate(createActor(CellarsCollectionActor, me, db));
      const ctx = userCtx(me);
      const walked: string[] = [];
      let after: string | undefined;
      for (let turn = 0; turn < 4; turn += 1) {
        const page = await actor.list(ctx, pageArgs({ first: 1, after }));
        walked.push(...page.entries.map((entry) => entry.node));
        after = page.entries.at(-1)?.cursor;
      }
      expect(walked).toEqual([a, b, c, theirs]);
    });
  });

  it("splits the visible set into Yours / From friends / Discover (D2)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await befriend(db, viewer, friend);
      await befriend(db, friend, viewer);

      const minePrivate = await seedCellar(db, viewer, "PRIVATE");
      const minePublic = await seedCellar(db, viewer, "PUBLIC");
      const coOwned = await seedCellar(db, stranger, "PRIVATE");
      await db.execute(sql`
        insert into public.cellar_owners (user_id, cellar_id)
        values (${viewer}::uuid, ${coOwned}::uuid)
      `);
      const friendsFriends = await seedCellar(db, friend, "FRIENDS");
      const friendsPublic = await seedCellar(db, friend, "PUBLIC");
      const friendsPrivate = await seedCellar(db, friend, "PRIVATE");
      const strangersPublic = await seedCellar(db, stranger, "PUBLIC");
      const strangersFriends = await seedCellar(db, stranger, "FRIENDS");

      const actor = await activate(
        createActor(CellarsCollectionActor, viewer, db),
      );
      const section = async (
        which: "MINE" | "FRIENDS" | "DISCOVER" | null,
      ): Promise<{ ids: string[]; total: number | null }> => {
        const page = await actor.list(
          userCtx(viewer),
          pageArgs({ first: 50 }),
          which,
        );
        return {
          ids: page.entries.map((entry) => entry.node),
          total: page.totalCount,
        };
      };

      const mine = await section("MINE");
      const friends = await section("FRIENDS");
      const discover = await section("DISCOVER");
      const all = await section(null);

      expect(new Set(mine.ids)).toEqual(
        new Set([minePrivate, minePublic, coOwned]),
      );
      expect(new Set(friends.ids)).toEqual(
        new Set([friendsFriends, friendsPublic]),
      );
      // A stranger's PUBLIC cellar is Discover, never Yours.
      expect(discover.ids).toEqual([strangersPublic]);
      expect(mine.ids).not.toContain(strangersPublic);

      // A partition of the visible set: nothing twice, nothing lost, nothing
      // the viewer could not already see.
      const union = [...mine.ids, ...friends.ids, ...discover.ids];
      expect(new Set(union).size).toBe(union.length);
      expect(new Set(union)).toEqual(new Set(all.ids));
      expect(union).not.toContain(friendsPrivate);
      expect(union).not.toContain(strangersFriends);

      // The count is the section's, not the whole set's.
      expect(mine.total).toBe(3);
      expect(friends.total).toBe(2);
      expect(discover.total).toBe(1);
    });
  });

  it("refuses a section it does not know", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        createActor(CellarsCollectionActor, viewer, db),
      );
      await expect(
        actor.list(
          userCtx(viewer),
          pageArgs({ first: 5 }),
          "EVERYONE" as unknown as "MINE",
        ),
      ).rejects.toThrow(/not a collection section/);
    });
  });

  it("authorizes on every turn of a warm activation (§1.5, C1)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedCellar(db, owner, "PRIVATE");
      const actor = await activate(
        createActor(CellarsCollectionActor, owner, db),
      );

      // Warm it with a call that is allowed.
      const warm = await actor.list(userCtx(owner), pageArgs({ first: 10 }));
      expect(warm.entries.length).toBeGreaterThan(0);

      // The same, warm activation, a different caller. C1's bug was that this
      // came back with a full result set.
      await expect(
        actor.list(userCtx(null), pageArgs({ first: 10 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.list(userCtx(await seedUser(db)), pageArgs({ first: 10 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });

  it("refuses a caller who is not the viewer it is keyed by (C2)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      await seedCellar(db, owner, "PUBLIC");
      const actor = await activate(
        createActor(CellarsCollectionActor, owner, db),
      );
      // Including an admin: §1.6's bypass is about seeing rows a policy hides,
      // not about becoming somebody else.
      for (const kind of ["user", "admin"] as const) {
        await expect(
          actor.list(
            { viewerId: other, kind, requestId: "r" },
            pageArgs({ first: 5 }),
          ),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect(actor.queryCount).toBe(0);
    });
  });

  /**
   * UI parity BUG 2 / G36. `/search` summed `list`'s page, which is every
   * cellar the viewer may *see*. The old page counted cellars the viewer
   * created or co-owns, and distinct items in them — so a stranger's PUBLIC
   * cellar and a friend's FRIENDS cellar, both of which `list` returns, must
   * contribute nothing here.
   */
  describe("stats", () => {
    const seedWine = async (db: DbOrTx, by: string): Promise<string> => {
      await db.execute(
        sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
      );
      const { rows: onboarding } = await db.execute<{ id: string }>(sql`
        insert into public.item_onboardings (user_id, item_type)
        values (${by}::uuid, 'WINE') returning id
      `);
      const { rows } = await db.execute<{ id: string }>(sql`
        insert into public.wines (name, created_by_id, vintage, style, item_onboarding_id)
        values ('w', ${by}::uuid, '2020-01-01', 'RED', ${onboarding[0]?.id}::uuid)
        returning id
      `);
      return rows[0]?.id ?? "";
    };
    const seedBeer = async (db: DbOrTx, by: string): Promise<string> => {
      const { rows: onboarding } = await db.execute<{ id: string }>(sql`
        insert into public.item_onboardings (user_id, item_type)
        values (${by}::uuid, 'BEER') returning id
      `);
      const { rows } = await db.execute<{ id: string }>(sql`
        insert into public.beers (name, created_by_id, item_onboarding_id)
        values ('b', ${by}::uuid, ${onboarding[0]?.id}::uuid) returning id
      `);
      return rows[0]?.id ?? "";
    };
    const bottle = async (
      db: DbOrTx,
      cellarId: string,
      by: string,
      column: "wine_id" | "beer_id",
      itemId: string,
      empty = false,
    ): Promise<void> => {
      await db.execute(sql`
        insert into public.cellar_items (cellar_id, created_by, ${sql.identifier(column)}, empty_at)
        values (${cellarId}::uuid, ${by}::uuid, ${itemId}::uuid,
                ${empty ? sql`now()` : sql`null`})
      `);
    };
    const statsOf = async (db: DbOrTx, viewerId: string) =>
      (await activate(createActor(CellarsCollectionActor, viewerId, db))).stats(
        userCtx(viewerId),
      );

    it("counts own and co-owned cellars, and the bottles still in them, only (D13)", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await befriend(db, me, friend);

        const mine = await seedCellar(db, me, "PRIVATE");
        const coOwned = await seedCellar(db, friend, "PRIVATE");
        await db.execute(sql`
          insert into public.cellar_owners (cellar_id, user_id)
          values (${coOwned}::uuid, ${me}::uuid)
        `);
        const friends = await seedCellar(db, friend, "FRIENDS");
        const strangers = await seedCellar(db, stranger, "PUBLIC");

        const wineA = await seedWine(db, me);
        const wineB = await seedWine(db, me);
        const beer = await seedBeer(db, me);
        // wineA twice in one cellar and once in another: three bottles.
        await bottle(db, mine, me, "wine_id", wineA);
        await bottle(db, mine, me, "wine_id", wineA);
        await bottle(db, coOwned, friend, "wine_id", wineA);
        // A finished bottle is no longer in the cellar: it counts nothing.
        await bottle(db, coOwned, friend, "wine_id", wineB, true);
        await bottle(db, mine, me, "beer_id", beer);
        // Visible to me, but not mine: must not count.
        const elsewhere = await seedWine(db, friend);
        await bottle(db, friends, friend, "wine_id", elsewhere);
        await bottle(
          db,
          strangers,
          stranger,
          "beer_id",
          await seedBeer(db, stranger),
        );

        // `list` does see all four; that is exactly why stats cannot sum it.
        expect(await listIds(db, me)).toHaveLength(4);

        expect(await statsOf(db, me)).toEqual({
          cellarCount: 2,
          itemCounts: {
            total: 4,
            byType: { WINE: 3, BEER: 1, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
          },
        });

        // A user with nothing of their own counts nothing — not the public
        // cellars around them.
        const newcomer = await seedUser(db);
        expect(await statsOf(db, newcomer)).toEqual({
          cellarCount: 0,
          itemCounts: {
            total: 0,
            byType: { WINE: 0, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
          },
        });
      });
    });

    it("answers only the viewer it is keyed by", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const other = await seedUser(db);
        const actor = await activate(
          createActor(CellarsCollectionActor, me, db),
        );
        await expect(actor.stats(userCtx(other))).rejects.toThrow(
          ForbiddenError,
        );
        await expect(actor.stats(userCtx(null))).rejects.toThrow(
          ForbiddenError,
        );
      });
    });
  });

  /**
   * X12 — universal search's "Your bottles": your own and co-owned cellars
   * only, open bottles only, by name, one hit per item per cellar.
   */
  describe("findBottles", () => {
    const find = async (
      db: DbOrTx,
      viewerId: string,
      term: string,
      limit?: number,
    ) =>
      (
        await activate(createActor(CellarsCollectionActor, viewerId, db))
      ).findBottles(userCtx(viewerId), { term, limit });

    it("finds your open bottles by name, grouped per cellar, and nobody else's", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const friend = await seedUser(db);
        await befriend(db, me, friend);
        const bar = await seedOwnedCellar(db, {
          createdById: me,
          name: "Bar Cart",
        });
        const shared = await seedOwnedCellar(db, {
          createdById: friend,
          name: "Shared",
          coOwnerIds: [me],
        });
        const friends = await seedOwnedCellar(db, {
          createdById: friend,
          privacy: "FRIENDS",
          name: "Friend's",
        });
        const lagavulin = await seedNamedWine(db, me, "Lagavulin 16");
        const other = await seedNamedWine(db, me, "Lagavulin 8");
        const unrelated = await seedNamedBeer(db, me, "Duvel");

        const first = await seedCellarItem(db, bar, me, lagavulin);
        const second = await seedCellarItem(db, bar, me, lagavulin);
        await seedCellarItem(db, shared, friend, lagavulin);
        const finished = await seedCellarItem(db, bar, me, other);
        await db.execute(sql`
          update public.cellar_items set empty_at = now() where id = ${finished}::uuid
        `);
        await seedCellarItem(db, bar, me, unrelated);
        // A friend's cellar is visible to me, but its bottles are not mine.
        await seedCellarItem(db, friends, friend, lagavulin);

        const result = await find(db, me, "lagavulin");
        expect(result.totalCount).toBe(2);
        expect(
          result.hits.map((hit) => [
            hit.cellarName,
            hit.itemName,
            hit.bottleCount,
          ]),
        ).toEqual([
          ["Bar Cart", "Lagavulin 16", 2],
          ["Shared", "Lagavulin 16", 1],
        ]);
        // One of Bar Cart's two (`now()` ties inside the test's transaction).
        expect([first, second]).toContain(result.hits[0]?.cellarItemId);
        expect(result.hits[0]?.item).toEqual(lagavulin);
      });
    });

    it("puts the exact name first, finds a typo, and counts past the limit", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const cellar = await seedOwnedCellar(db, { createdById: me });
        for (const name of ["Duvel Tripel Hop", "Duvel", "Laphroaig 10"]) {
          await seedCellarItem(
            db,
            cellar,
            me,
            await seedNamedBeer(db, me, name),
          );
        }
        const duvel = await find(db, me, "duvel", 1);
        expect(duvel.hits.map((hit) => hit.itemName)).toEqual(["Duvel"]);
        expect(duvel.totalCount).toBe(2);
        const typo = await find(db, me, "laphroig");
        expect(typo.hits.map((hit) => hit.itemName)).toEqual(["Laphroaig 10"]);
        // `%` is a character, not a wildcard.
        expect((await find(db, me, "%")).hits).toEqual([]);
      });
    });

    it("prefers a bottle already opened as the one a tap opens", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const cellar = await seedOwnedCellar(db, { createdById: me });
        const wine = await seedNamedWine(db, me, "Barolo");
        await seedCellarItem(db, cellar, me, wine);
        const opened = await seedCellarItem(db, cellar, me, wine);
        await db.execute(sql`
          update public.cellar_items set open_at = now() where id = ${opened}::uuid
        `);
        const result = await find(db, me, "barolo");
        expect(result.hits[0]?.cellarItemId).toBe(opened);
        expect(result.hits[0]?.bottleCount).toBe(2);
      });
    });

    it("refuses another viewer, a blank term and an out-of-range limit", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const other = await seedUser(db);
        const actor = await activate(
          createActor(CellarsCollectionActor, me, db),
        );
        await expect(
          actor.findBottles(userCtx(other), { term: "x" }),
        ).rejects.toThrow(ForbiddenError);
        await expect(find(db, me, "  ")).rejects.toThrow(ValidationError);
        await expect(find(db, me, "x", 51)).rejects.toThrow(ValidationError);
      });
    });
  });

  /**
   * UI parity G9 — "Located in". The old query listed every cellar holding a
   * bottle, whoever's; this must list exactly the ones `canSeeCellar` admits,
   * and only for bottles still in them.
   */
  describe("containing", () => {
    const bottle = async (
      db: DbOrTx,
      cellarId: string,
      by: string,
      wineId: string,
      empty = false,
    ): Promise<void> => {
      await db.execute(sql`
        insert into public.cellar_items (cellar_id, created_by, wine_id, empty_at)
        values (${cellarId}::uuid, ${by}::uuid, ${wineId}::uuid,
                ${empty ? sql`now()` : sql`null`})
      `);
    };
    const seedWineRow = async (db: DbOrTx, by: string): Promise<string> => {
      await db.execute(
        sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
      );
      const { rows: onboarding } = await db.execute<{ id: string }>(sql`
        insert into public.item_onboardings (user_id, item_type)
        values (${by}::uuid, 'WINE') returning id
      `);
      const { rows } = await db.execute<{ id: string }>(sql`
        insert into public.wines (name, created_by_id, vintage, style, item_onboarding_id)
        values ('w', ${by}::uuid, '2020-01-01', 'RED', ${onboarding[0]?.id}::uuid)
        returning id
      `);
      return rows[0]?.id ?? "";
    };

    it("lists visible cellars holding a live bottle, by name, matching canSeeCellar", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await befriend(db, owner, friend);
        const wine = await seedWineRow(db, owner);
        const other = await seedWineRow(db, owner);

        const cellars = {
          PRIVATE: await seedCellar(db, owner, "PRIVATE", "b private"),
          FRIENDS: await seedCellar(db, owner, "FRIENDS", "c friends"),
          PUBLIC: await seedCellar(db, owner, "PUBLIC", "a public"),
        } as const;
        for (const id of Object.values(cellars)) {
          await bottle(db, id, owner, wine);
        }
        // Two bottles in one cellar: still one cellar.
        await bottle(db, cellars.PUBLIC, owner, wine);
        // Only an emptied bottle: not "located in" any more.
        const emptied = await seedCellar(db, owner, "PUBLIC", "d emptied");
        await bottle(db, emptied, owner, wine, true);

        for (const [who, viewerId, isFriend] of [
          ["owner", owner, false],
          ["friend", friend, true],
          ["stranger", stranger, false],
        ] as const) {
          const actor = await activate(
            createActor(CellarsCollectionActor, viewerId, db),
          );
          const [forWine, forOther] = await actor.containing(
            userCtx(viewerId),
            [
              { type: "WINE", id: wine },
              { type: "WINE", id: other },
            ],
          );
          const expected = (["PUBLIC", "PRIVATE", "FRIENDS"] as const)
            .filter((privacy) =>
              canSeeCellar(userCtx(viewerId), {
                createdById: owner,
                privacy,
                coOwnerIds: [],
                viewerIsFriendOfCreator: isFriend,
              }),
            )
            .map((privacy) => cellars[privacy]);
          // `expected` is already in name order: a, b, c.
          expect(forWine?.nodes, who).toEqual(expected);
          expect(forWine?.totalCount, who).toBe(expected.length);
          expect(forOther).toEqual({ nodes: [], totalCount: 0 });
          expect(actor.queryCount).toBe(1);
        }
      });
    });

    /**
     * X09 "Your bottles": only cellars the viewer created or co-owns —
     * never a friend's or a stranger's, however visible — and a finished
     * bottle's cellar only when asked for.
     */
    it("ownContaining: your own and co-owned cellars only, by name", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const friend = await seedUser(db);
        await befriend(db, me, friend);
        const wine = await seedWineRow(db, me);

        const mine = await seedCellar(db, me, "PRIVATE", "b mine");
        const coOwned = await seedCellar(db, friend, "PRIVATE", "a shared");
        await db.execute(sql`
          insert into public.cellar_owners (cellar_id, user_id)
          values (${coOwned}::uuid, ${me}::uuid)
        `);
        const friendsPublic = await seedCellar(
          db,
          friend,
          "PUBLIC",
          "c theirs",
        );
        const finishedOnly = await seedCellar(db, me, "PRIVATE", "d finished");
        await bottle(db, mine, me, wine);
        await bottle(db, coOwned, friend, wine);
        await bottle(db, friendsPublic, friend, wine);
        await bottle(db, finishedOnly, me, wine, true);

        const actor = await activate(
          createActor(CellarsCollectionActor, me, db),
        );
        const [live] = await actor.ownContaining(userCtx(me), [
          { type: "WINE", id: wine },
        ]);
        expect(live).toEqual({ nodes: [coOwned, mine], totalCount: 2 });

        const [all] = await actor.ownContaining(
          userCtx(me),
          [{ type: "WINE", id: wine }],
          true,
        );
        expect(all).toEqual({
          nodes: [coOwned, mine, finishedOnly],
          totalCount: 3,
        });
        // The friend sees their own two — never "b mine", which they may not.
        const theirs = await activate(
          createActor(CellarsCollectionActor, friend, db),
        );
        const [forFriend] = await theirs.ownContaining(userCtx(friend), [
          { type: "WINE", id: wine },
        ]);
        expect(forFriend?.nodes).toEqual([coOwned, friendsPublic]);
      });
    });

    it("refuses another viewer before reading", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const other = await seedUser(db);
        const actor = await activate(
          createActor(CellarsCollectionActor, me, db),
        );
        await expect(
          actor.ownContaining(userCtx(other), [
            { type: "WINE", id: "00000000-0000-4000-8000-000000000001" },
          ]),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.containing(userCtx(other), [
            { type: "WINE", id: "00000000-0000-4000-8000-000000000001" },
          ]),
        ).rejects.toThrow(ForbiddenError);
        expect(actor.queryCount).toBe(0);
      });
    });
  });
});
