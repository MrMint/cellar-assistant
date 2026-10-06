/**
 * `CellarsCollectionActor` — C3 (§2.2, §1.5, §1.6).
 *
 * Three things: the §1.6 owner / friend / stranger trio (plus the co-owner
 * branch a cellar has and a tier list does not), the keyset page-walk, and the
 * two rules C1 and C2 paid for — authorization on **every** turn of a warm
 * activation, and a viewer-keyed actor refusing a caller who is not that
 * viewer.
 */
import {
  ForbiddenError,
  type PermissionType,
  pageArgs,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { canSeeCellar } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
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

    it("counts own and co-owned cellars, and distinct items in them, only", async () => {
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
        // wineA twice in one cellar and once in another: one item.
        await bottle(db, mine, me, "wine_id", wineA);
        await bottle(db, mine, me, "wine_id", wineA);
        await bottle(db, coOwned, friend, "wine_id", wineA);
        // An emptied bottle still counts its item, as the old query did.
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
            total: 3,
            byType: { WINE: 2, BEER: 1, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
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

    it("refuses another viewer before reading", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const other = await seedUser(db);
        const actor = await activate(
          createActor(CellarsCollectionActor, me, db),
        );
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
