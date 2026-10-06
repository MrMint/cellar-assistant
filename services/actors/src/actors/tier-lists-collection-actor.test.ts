/**
 * `TierListsCollectionActor` — C3 (§2.2, §1.6).
 *
 * §1.6's owner / friend / stranger trio, and the assertion that the index
 * agrees with `canSeeTierList` — the same function B7's `TierListActor` and
 * C1's `lib/tier-list-visibility.ts` use. A disagreement between the three is
 * `target-stack.md` §7's hole reopening one layer up.
 */
import {
  ForbiddenError,
  pageArgs,
  REVERSE_EDGE_MAX_PARENTS,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { canSeeTierList } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedFriendship,
  seedPlace,
  seedTierList,
  seedTierListPlace,
  seedWine,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { TierListsCollectionActor } from "./tier-lists-collection-actor.ts";

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("TierListsCollectionActor", () => {
  afterAll(closeTestDb);

  it("matches canSeeTierList for owner, friend and stranger", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, owner, friend);

      const lists = {
        PRIVATE: await seedTierList(db, {
          createdById: owner,
          privacy: "PRIVATE",
        }),
        FRIENDS: await seedTierList(db, {
          createdById: owner,
          privacy: "FRIENDS",
        }),
        PUBLIC: await seedTierList(db, {
          createdById: owner,
          privacy: "PUBLIC",
        }),
      } as const;

      const seenBy = async (viewerId: string): Promise<string[]> => {
        const actor = await activate(
          createActor(TierListsCollectionActor, viewerId, db),
        );
        const page = await actor.list(
          userCtx(viewerId, "r"),
          pageArgs({ first: 100 }),
        );
        return page.entries.map((entry) => entry.node);
      };

      for (const [who, viewerId, isFriend] of [
        ["owner", owner, false],
        ["friend", friend, true],
        ["stranger", stranger, false],
      ] as const) {
        const ids = await seenBy(viewerId);
        for (const privacy of ["PRIVATE", "FRIENDS", "PUBLIC"] as const) {
          const policy = canSeeTierList(userCtx(viewerId, "r"), {
            createdById: owner,
            privacy,
            viewerIsFriendOfCreator: isFriend,
          });
          expect(ids.includes(lists[privacy]), `${who} / ${privacy}`).toBe(
            policy,
          );
        }
      }
    });
  });

  it("authorizes on every turn and refuses another viewer's key", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      await seedTierList(db, { createdById: owner, privacy: "PUBLIC" });
      const actor = await activate(
        createActor(TierListsCollectionActor, owner, db),
      );
      expect(
        (await actor.list(userCtx(owner, "r"), pageArgs({ first: 5 }))).entries
          .length,
      ).toBeGreaterThan(0);
      await expect(
        actor.list(userCtx(other, "r"), pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  /**
   * UI parity G8. The old `ItemTierLists` query returned every list an item
   * was on, private ones included, with its **name**. `entriesOf` must return
   * a row exactly when `canSeeTierList` would show its list — no more.
   */
  describe("entriesOf", () => {
    const rankWine = async (
      db: DbOrTx,
      tierListId: string,
      wineId: string,
      band: number,
    ): Promise<void> => {
      await db.execute(sql`
        insert into public.tier_list_items (tier_list_id, wine_id, band, position)
        values (${tierListId}::uuid, ${wineId}::uuid, ${band}, 0)
      `);
    };

    it("returns an entry exactly when canSeeTierList shows its list", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const wine = await seedWine(db, owner);
        const place = await seedPlace(db, { name: "P", lng: 0, lat: 0 });

        const lists = {
          PRIVATE: await seedTierList(db, {
            createdById: owner,
            privacy: "PRIVATE",
            name: "secret list",
          }),
          FRIENDS: await seedTierList(db, {
            createdById: owner,
            privacy: "FRIENDS",
          }),
          PUBLIC: await seedTierList(db, {
            createdById: owner,
            privacy: "PUBLIC",
          }),
        } as const;
        for (const [band, id] of Object.values(lists).entries()) {
          await rankWine(db, id, wine.id, band);
          await seedTierListPlace(db, id, place, band);
        }

        for (const [who, viewerId, isFriend] of [
          ["owner", owner, false],
          ["friend", friend, true],
          ["stranger", stranger, false],
        ] as const) {
          const actor = await activate(
            createActor(TierListsCollectionActor, viewerId, db),
          );
          const [forWine, forPlace] = await actor.entriesOf(
            userCtx(viewerId, "r"),
            [wine, { type: "PLACE", id: place }],
          );
          for (const privacy of ["PRIVATE", "FRIENDS", "PUBLIC"] as const) {
            const policy = canSeeTierList(userCtx(viewerId, "r"), {
              createdById: owner,
              privacy,
              viewerIsFriendOfCreator: isFriend,
            });
            for (const [label, result] of [
              ["wine", forWine],
              ["place", forPlace],
            ] as const) {
              const listIds = (result?.nodes ?? []).map((n) => n.tierListId);
              expect(
                listIds.includes(lists[privacy]),
                `${who} / ${privacy} / ${label}`,
              ).toBe(policy);
            }
          }
          // The count is of visible rows too — it must not leak the hidden one.
          expect(forWine?.totalCount).toBe(forWine?.nodes.length);
          // One authorised turn, one statement batch, whatever the ref count.
          expect(actor.queryCount).toBe(1);
        }
      });
    });

    it("aligns to refs, carries band and entry, and answers [] for an unranked ref", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const ranked = await seedWine(db, me);
        const unranked = await seedWine(db, me);
        const list = await seedTierList(db, { createdById: me });
        await rankWine(db, list, ranked.id, 4);

        const actor = await activate(
          createActor(TierListsCollectionActor, me, db),
        );
        const result = await actor.entriesOf(userCtx(me, "r"), [
          unranked,
          ranked,
        ]);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ nodes: [], totalCount: 0 });
        expect(result[1]?.totalCount).toBe(1);
        expect(result[1]?.nodes[0]).toMatchObject({
          tierListId: list,
          band: 4,
          entry: ranked,
        });
        expect(await actor.entriesOf(userCtx(me, "r"), [])).toEqual([]);
      });
    });

    it("refuses another viewer before reading, and an oversized batch", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const other = await seedUser(db);
        const wine = await seedWine(db, me);
        const actor = await activate(
          createActor(TierListsCollectionActor, me, db),
        );
        await expect(
          actor.entriesOf(userCtx(other, "r"), [wine]),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          actor.entriesOf(
            userCtx(me, "r"),
            Array.from({ length: REVERSE_EDGE_MAX_PARENTS + 1 }, () => wine),
          ),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(actor.queryCount).toBe(0);
      });
    });
  });
});
