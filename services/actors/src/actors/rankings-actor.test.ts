/**
 * `RankingsActor` — C2's acceptance (migration plan §6 "C2", §2.4, §1.5).
 *
 * > Accept: … `RankingsActor` with `scope: friends` matches the old
 * > `item_scores` output for a fixture reviewer set, and a client cannot supply
 * > an arbitrary reviewer list.
 *
 * Two halves.
 *
 * **The aggregation is reproduced, and proved against the original.** The
 * `item_scores` native query is still declared in
 * `nhost/metadata/databases/databases.yaml`, so `runNativeQuery` below executes
 * its SQL verbatim — the same `AVG`, `COUNT`, `CASE` and `cardinality`
 * branch — and the tests assert the actor's projection equals it row for row.
 * That is a differential test, not a restatement: if the port drifts, the
 * comparison fails rather than both sides moving together.
 *
 * **The reviewer gap is closed, and the closure is proved by first showing the
 * hole.** `runNativeQuery` is also how a stranger's arbitrary reviewer array is
 * demonstrated to work today, exactly as `place-search-sql.test.ts` reproduces
 * the map hole before closing it. A test that only shows the new path returning
 * the right thing cannot tell "the gate works" from "the fixture is wrong".
 */
import type { Ctx, ItemRef, RankingsInput } from "@cellar-assistant/contracts";
import { ForbiddenError, ValidationError } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedFriendship,
  seedItemOfType,
  seedItemReview,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { RankingsActor } from "./rankings-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (viewerId: string, db: DbOrTx) =>
  activate(createActor(RankingsActor, viewerId, db));

/* -------------------------------------------------------------------------- */
/* The original                                                                */
/* -------------------------------------------------------------------------- */

type NativeRow = {
  readonly item_id: string;
  readonly type: string;
  readonly score: string;
  readonly count: string;
};

/**
 * `item_scores`, verbatim from `nhost/metadata/databases/databases.yaml`, with
 * the client's `order_by: {score: desc, count: desc}` and `limit: 200`.
 *
 * The `{{reviewers}}` placeholder is a Hasura native-query argument; here it is
 * a bound `uuid[]` parameter passed as a `{…}` literal, because Drizzle's `sql`
 * flattens a JS array into one placeholder per element (C1's fixture trap).
 *
 * `coalesce(...) as item_id` is added on top of the original's six columns so a
 * row can be compared with a `RankingEntry`; it changes nothing about the
 * grouping or the aggregates.
 */
const runNativeQuery = async (
  db: DbOrTx,
  reviewers: readonly string[],
): Promise<readonly NativeRow[]> => {
  const { rows } = await db.execute<NativeRow>(sql`
    SELECT coalesce(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) as item_id,
           AVG(score) as score, COUNT(*) as count,
           CASE WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
                WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
                WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
                WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
                WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
                ELSE 'SPIRIT'::text END as type
    FROM item_reviews
    WHERE CASE
      WHEN cardinality(${`{${reviewers.join(",")}}`}::UUID[]) = 0 THEN true
      ELSE user_id = ANY (${`{${reviewers.join(",")}}`}::UUID[])
    END
    GROUP BY (beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id)
    ORDER BY score DESC, count DESC, item_id ASC
    LIMIT 200
  `);
  return rows;
};

/** The native query's rows in the shape `RankingEntry` uses, for comparison. */
const asEntries = (rows: readonly NativeRow[]) =>
  rows.map((row) => ({
    item: { type: row.type, id: row.item_id },
    score: Number(row.score),
    reviewCount: Number(row.count),
  }));

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Viewer, one friend, one stranger; one item of each of the six types so the
 * `CASE`'s every branch — including the `ELSE 'SPIRIT'` — is exercised, and
 * scores chosen so that averaging is not the identity and the count tiebreak
 * actually breaks a tie.
 */
const scenario = async (db: DbOrTx) => {
  const viewer = await seedUser(db);
  const friend = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, viewer, friend);

  const items: Record<string, ItemRef> = {
    wine: await seedItemOfType(db, "WINE", viewer, "Ranked Wine"),
    beer: await seedItemOfType(db, "BEER", viewer, "Ranked Beer"),
    spirit: await seedItemOfType(db, "SPIRIT", viewer, "Ranked Spirit"),
    coffee: await seedItemOfType(db, "COFFEE", viewer, "Ranked Coffee"),
    sake: await seedItemOfType(db, "SAKE", viewer, "Ranked Sake"),
    tea: await seedItemOfType(db, "TEA", viewer, "Ranked Tea"),
  };

  // wine: viewer 5, friend 4        → everyone 4.5 / 2, me 5 / 1, friends 4 / 1
  // beer: friend 5, stranger 1      → everyone 3 / 2,   me —,     friends 5 / 1
  // spirit: viewer 4                → the ELSE branch of the CASE
  // coffee: stranger 5              → visible only to EVERYONE
  // sake / tea: viewer 3, 2         → the two branches nothing else covers
  await seedItemReview(db, viewer, items.wine as ItemRef, 5);
  await seedItemReview(db, friend, items.wine as ItemRef, 4);
  await seedItemReview(db, friend, items.beer as ItemRef, 5);
  await seedItemReview(db, stranger, items.beer as ItemRef, 1);
  await seedItemReview(db, viewer, items.spirit as ItemRef, 4);
  await seedItemReview(db, stranger, items.coffee as ItemRef, 5);
  await seedItemReview(db, viewer, items.sake as ItemRef, 3);
  await seedItemReview(db, viewer, items.tea as ItemRef, 2);

  return { viewer, friend, stranger, items };
};

describe.skipIf(skip)("RankingsActor", () => {
  afterAll(closeTestDb);

  /* -------------------------------------------------------------------- */
  /* 1. The aggregation                                                    */
  /* -------------------------------------------------------------------- */

  describe("reproduces `item_scores`' aggregation", () => {
    it("matches the native query row for row, for every scope", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);

        const cases: ReadonlyArray<[RankingsInput["scope"], string[]]> = [
          ["EVERYONE", []],
          ["ME", [s.viewer]],
          ["FRIENDS", [s.friend]],
          ["ME_AND_FRIENDS", [s.viewer, s.friend]],
        ];
        for (const [scope, reviewers] of cases) {
          const mine = await actor.all(userCtx(s.viewer), { scope });
          expect(mine, scope).toEqual(
            asEntries(await runNativeQuery(db, reviewers)),
          );
        }
      });
    });

    it("computes AVG(score) and COUNT(*), not the last score", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const everyone = await actor.all(userCtx(s.viewer), {
          scope: "EVERYONE",
        });
        const wine = everyone.find((e) => e.item.id === s.items.wine?.id);
        expect(wine).toEqual({
          item: s.items.wine,
          score: 4.5,
          reviewCount: 2,
        });
        const beer = everyone.find((e) => e.item.id === s.items.beer?.id);
        expect(beer).toEqual({ item: s.items.beer, score: 3, reviewCount: 2 });
      });
    });

    it("reproduces the CASE, including `ELSE 'SPIRIT'`, for all six types", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const byId = new Map(
          (await actor.all(userCtx(s.viewer), { scope: "EVERYONE" })).map(
            (entry) => [entry.item.id, entry.item.type],
          ),
        );
        for (const [key, ref] of Object.entries(s.items)) {
          expect(byId.get(ref.id), key).toBe(ref.type);
        }
        // `SPIRIT` is the CASE's `ELSE`, never a tested branch — the table's
        // `num_nonnulls(...) = 1` check is what makes that sound.
        expect(byId.get(s.items.spirit?.id ?? "")).toBe("SPIRIT");
      });
    });

    it("orders by score then count, and caps at 200", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const entries = await actor.all(userCtx(s.viewer), {
          scope: "EVERYONE",
        });
        for (let i = 1; i < entries.length; i += 1) {
          const previous = entries[i - 1];
          const current = entries[i];
          if (previous === undefined || current === undefined) continue;
          expect(previous.score).toBeGreaterThanOrEqual(current.score);
          if (previous.score === current.score) {
            expect(previous.reviewCount).toBeGreaterThanOrEqual(
              current.reviewCount,
            );
          }
        }
        expect(entries.length).toBeLessThanOrEqual(200);
      });
    });

    it("filters by item type exactly as the old `where: {type: {_in: …}}` did", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const filtered = await actor.all(userCtx(s.viewer), {
          scope: "EVERYONE",
          types: ["WINE", "SPIRIT"],
        });
        expect(filtered.map((e) => e.item.type).sort()).toEqual([
          "SPIRIT",
          "WINE",
        ]);
        // The old filter ran on the CASE's output, after grouping; this one
        // runs on the columns, before it. The check constraint makes them the
        // same predicate — assert that rather than assume it.
        const native = asEntries(await runNativeQuery(db, [])).filter((row) =>
          ["WINE", "SPIRIT"].includes(row.item.type),
        );
        expect(filtered).toEqual(native);
      });
    });
  });

  /* -------------------------------------------------------------------- */
  /* 2. The reviewer gap                                                   */
  /* -------------------------------------------------------------------- */

  describe("the client cannot name reviewers (target-stack §7)", () => {
    it("the native query answers an arbitrary reviewer set — this is the hole", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        // Exactly what `RankingsClient` does today: `{uuid, uuid}` built from
        // whatever the client likes, with no relationship to who is asking.
        // The stranger is not the viewer's friend and has no claim on their
        // reviews; the query answers anyway.
        const leaked = await runNativeQuery(db, [s.viewer, s.friend]);
        expect(leaked.length).toBeGreaterThan(0);
        expect(leaked.some((row) => row.item_id === s.items.wine?.id)).toBe(
          true,
        );
      });
    });

    it("has no field through which a reviewer id could arrive", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        // The gate is the contract's shape, so the test is a runtime probe of
        // it: an input carrying reviewer ids is not a `RankingsInput`, and the
        // extra key is ignored rather than honoured.
        const smuggled = {
          scope: "ME",
          reviewers: [s.friend, s.stranger],
          userIds: [s.stranger],
        } as unknown as RankingsInput;
        expect(await actor.all(userCtx(s.viewer), smuggled)).toEqual(
          await actor.all(userCtx(s.viewer), { scope: "ME" }),
        );
        // …and `ME` really is the viewer alone.
        expect(asEntries(await runNativeQuery(db, [s.viewer]))).toEqual(
          await actor.all(userCtx(s.viewer), { scope: "ME" }),
        );
      });
    });

    it("refuses a scope it does not know rather than guessing", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        await expect(
          actor.all(userCtx(s.viewer), {
            scope: "EVERYONE_INCLUDING_BOB",
          } as unknown as RankingsInput),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.all(userCtx(s.viewer), {
            scope: "ME",
            types: ["MEAD"],
          } as unknown as RankingsInput),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("derives FRIENDS from the viewer's own rows, in either direction", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        // The friendship row is `(viewer, friend)`. The *friend's* actor must
        // still resolve the viewer as a friend — B4: one row is written per
        // side and `isFriend` matches either way, so a one-directional read
        // would silently drop reviewers for the width of the outbox window.
        const friendActor = await newActor(s.friend, db);
        expect(
          await friendActor.all(userCtx(s.friend), { scope: "FRIENDS" }),
        ).toEqual(asEntries(await runNativeQuery(db, [s.viewer])));
      });
    });

    it("FRIENDS with no friends is empty, not global (the widening trap)", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.stranger, db);
        // Today's client sends `{}` here and the native query's
        // `cardinality = 0` branch turns it into "everyone" — a denied filter
        // widening the answer, the same shape as a NULL `tier_list_ids`.
        expect(await runNativeQuery(db, [])).not.toEqual([]);
        expect(
          await actor.all(userCtx(s.stranger), { scope: "FRIENDS" }),
        ).toEqual([]);
      });
    });
  });

  /* -------------------------------------------------------------------- */
  /* 3. Authorization, every turn                                          */
  /* -------------------------------------------------------------------- */

  describe("authorization runs per turn, before the projection (§1.5)", () => {
    it("refuses a viewer addressing another viewer's actor", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        await expect(
          actor.all(userCtx(s.stranger), { scope: "ME" }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("refuses an anonymous caller on a *warm* activation (regression)", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const input: RankingsInput = { scope: "EVERYONE" };
        expect(await actor.all(userCtx(s.viewer), input)).toHaveLength(6);
        expect(actor.projectionRuns).toBe(1);

        await expect(actor.all(userCtx(null), input)).rejects.toThrow(
          ForbiddenError,
        );
        expect(await actor.all(userCtx(s.viewer), input)).toHaveLength(6);
      });
    });

    it("re-reads the friend set rather than holding it (§1.3)", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const input: RankingsInput = { scope: "FRIENDS" };
        expect(await actor.all(userCtx(s.viewer), input)).toEqual(
          asEntries(await runNativeQuery(db, [s.friend])),
        );

        // `friends` belongs to `UserActor`, so this actor may not cache it.
        // A friendship accepted between two turns has to show up at once.
        await seedFriendship(db, s.stranger, s.viewer);
        expect(await actor.all(userCtx(s.viewer), input)).toEqual(
          asEntries(await runNativeQuery(db, [s.friend, s.stranger])),
        );
      });
    });

    it("pages one ranking without re-querying, and re-queries a fresh read", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const actor = await newActor(s.viewer, db);
        const input: RankingsInput = { scope: "EVERYONE" };

        const first = await actor.results(userCtx(s.viewer), input, {
          first: 2,
          after: null,
        });
        expect(first.entries).toHaveLength(2);
        expect(actor.projectionRuns).toBe(1);

        const second = await actor.results(userCtx(s.viewer), input, {
          first: 2,
          after: first.entries[1]?.cursor ?? null,
        });
        expect(second.entries).toHaveLength(2);
        expect(actor.projectionRuns).toBe(1);

        await actor.all(userCtx(s.viewer), input);
        expect(actor.projectionRuns).toBe(2);
      });
    });
  });
});
