/**
 * `PlaceReviewActor` and `PlaceActor.applyReview` against a real Postgres
 * (X27 / D28): the AI review of a pending place, delivered by the outbox.
 *
 * The harness has no sidecar, so `inProcessApplier` wires the review actor to
 * a real, in-process `PlaceActor` sharing the test's transaction — the shape
 * `place-creation-actor.test.ts` uses for `create`. Places are created the
 * production way, through `PlaceActor.create`, so the row, its
 * `review_requested_at` and its queued outbox row are all genuine.
 *
 * What D28 asks for, and where each is proven:
 *
 *  - approved → shared: the place appears for a stranger (`PlaceActor.get`);
 *  - rejected → creator-only, with the reason;
 *  - unreviewed (no provider, a failing model) → stays `pending`, never an
 *    approval nobody made;
 *  - suggestions are stored for the creator, never applied;
 *  - a verdict for an older submission, a decided place or a deleted one is
 *    `skipped` and costs no model call;
 *  - and the duplicate rule, which a creation can no longer apply across
 *    users without an oracle, is applied at approval — including under real
 *    concurrency, which is what the geocell locks are for now.
 */
import type { PlaceReview } from "@cellar-assistant/contracts";
import {
  adminCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import { places } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { geocellOf } from "../lib/geocell.ts";
import {
  DEFAULT_REJECTION_REASON,
  type PlaceReviewer,
  type PlaceReviewSubject,
  setPlaceReviewer,
  unconfiguredPlaceReviewer,
} from "../lib/place-review.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDb,
  withTestDb,
} from "../lib/testing.ts";
import { PlaceActor } from "./place-actor.ts";
import { PlaceReviewActor, type ReviewApplier } from "./place-review-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const SYSTEM = systemCtx("outbox:test");
const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

let seq = 0;
const fixtureName = (): string => {
  seq += 1;
  return `X27 Fixture ${Date.now().toString(36)}-${seq}`;
};

const placeActor = (db: DbOrTx, id: string) =>
  activate(new PlaceActor(daprClient(), new ActorId(id), db));

/** The production path to `PlaceActor.applyReview`, in process. */
const inProcessApplier =
  (db: DbOrTx): ReviewApplier =>
  async (ctx, placeId, input) =>
    (await placeActor(db, placeId)).applyReview(ctx, input);

const reviewActor = (
  db: DbOrTx,
  placeId: string,
  review?: PlaceReviewer,
): Promise<PlaceReviewActor> =>
  activate(
    review === undefined
      ? new PlaceReviewActor(
          daprClient(),
          new ActorId(placeId),
          db,
          undefined,
          inProcessApplier(db),
        )
      : new PlaceReviewActor(
          daprClient(),
          new ActorId(placeId),
          db,
          review,
          inProcessApplier(db),
        ),
  );

const verdict = (overrides: Partial<PlaceReview> = {}): PlaceReview => ({
  approved: true,
  confidenceAdjustment: 0.2,
  flags: [],
  ...overrides,
});

/** A reviewer that answers `review` and records every subject it is asked. */
const answering = (review: PlaceReview) => {
  const seen: PlaceReviewSubject[] = [];
  const reviewer: PlaceReviewer = async (_ctx, subject) => {
    seen.push(subject);
    return review;
  };
  return { reviewer, seen };
};

/** A pending place, created the production way. Returns its id and stamp. */
const createPending = async (
  db: DbOrTx,
  creator: string,
  overrides: {
    readonly name?: string;
    readonly location?: { lng: number; lat: number };
    readonly categories?: string[];
    readonly description?: string | null;
  } = {},
): Promise<{ id: string; submittedAt: string }> => {
  const id = crypto.randomUUID();
  const actor = await placeActor(db, id);
  await actor.create(userCtx(creator, `r-create-${id}`), {
    name: overrides.name ?? fixtureName(),
    categories: overrides.categories ?? ["wine_bar"],
    location: overrides.location ?? SAN_FRANCISCO,
    description: overrides.description ?? null,
    createdById: creator,
  });
  const [row] = await db
    .select({ requested: places.reviewRequestedAt })
    .from(places)
    .where(eq(places.id, id));
  return { id, submittedAt: row?.requested?.toISOString() ?? "" };
};

const rowOf = async (db: DbOrTx, id: string) => {
  const [row] = await db.select().from(places).where(eq(places.id, id));
  return row;
};

const { skip } = await resolveTestDatabase();
afterAll(closeTestDb);

describe.skipIf(skip)("PlaceReviewActor + PlaceActor.applyReview (X27)", () => {
  it("is entity-category, like the registry it sits beside", () => {
    expect(PlaceReviewActor.category).toBe("entity");
  });

  it("a request may never call it — the caller is refused before anything is read", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);
      const { reviewer, seen } = answering(verdict());
      const actor = await reviewActor(db, id, reviewer);
      await expect(
        actor.review(userCtx(creator, "r"), { submittedAt }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(seen).toEqual([]);
      // `applyReview` holds the same line.
      await expect(
        (await placeActor(db, id)).applyReview(userCtx(creator, "r"), {
          submittedAt,
          review: verdict(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("approve → shared: approved, the review's confidence, and a stranger can now see it", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);

      // Before: absent for the stranger, exactly as an unknown id.
      await expect(
        (await placeActor(db, id)).get(userCtx(stranger, "r0")),
      ).rejects.toBeInstanceOf(NotFoundError);

      const { reviewer, seen } = answering(
        verdict({ confidenceAdjustment: 0.3 }),
      );
      const outcome = await (await reviewActor(db, id, reviewer)).review(
        SYSTEM,
        { submittedAt },
      );
      expect(outcome).toMatchObject({ placeId: id, status: "approved" });
      expect(seen).toHaveLength(1);

      const row = await rowOf(db, id);
      expect(row?.reviewStatus).toBe("approved");
      expect(Number(row?.confidence)).toBe(0.8);
      expect(row?.reviewedAt).not.toBeNull();

      const seenByStranger = await (await placeActor(db, id)).get(
        userCtx(stranger, "r1"),
      );
      expect(seenByStranger.reviewStatus).toBe("approved");
    });
  });

  it("reject → still creator-only, carrying the model's reason (or a plain default when it gave none)", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const cases = [
        [
          "This looks like a private residence.",
          "This looks like a private residence.",
        ],
        [null, DEFAULT_REJECTION_REASON],
        ["   ", DEFAULT_REJECTION_REASON],
      ] as const;
      for (const [index, [reason, expected]] of cases.entries()) {
        // Far apart: one creator's near-identical fixtures would otherwise
        // block each other as duplicates.
        const { id, submittedAt } = await createPending(db, creator, {
          location: {
            lng: SAN_FRANCISCO.lng + index * 0.05,
            lat: SAN_FRANCISCO.lat,
          },
        });
        const { reviewer } = answering(
          verdict({ approved: false, rejectionReason: reason }),
        );
        const outcome = await (await reviewActor(db, id, reviewer)).review(
          SYSTEM,
          { submittedAt },
        );
        expect(outcome.status).toBe("rejected");

        const mine = await (await placeActor(db, id)).get(
          userCtx(creator, "r-mine"),
        );
        expect(mine.reviewStatus).toBe("rejected");
        expect(mine.rejectionReason).toBe(expected);
        await expect(
          (await placeActor(db, id)).get(userCtx(stranger, "r-theirs")),
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    });
  });

  it("never an approval nobody made: an unconfigured provider leaves it pending, quietly — nothing to retry", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);
      const outcome = await (
        await reviewActor(db, id, unconfiguredPlaceReviewer)
      ).review(SYSTEM, { submittedAt });
      expect(outcome).toEqual({
        placeId: id,
        status: "pending",
        reason: "unconfigured",
      });
      expect((await rowOf(db, id))?.reviewStatus).toBe("pending");
    });
  });

  it("never an approval nobody made: a failing model fails the delivery (the outbox retries) and the place stays pending", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);
      const boom = new ConflictError("the model answered with no verdict");
      await expect(
        (
          await reviewActor(db, id, async () => {
            throw boom;
          })
        ).review(SYSTEM, { submittedAt }),
      ).rejects.toBe(boom);
      const row = await rowOf(db, id);
      expect(row?.reviewStatus).toBe("pending");
      expect(row?.reviewedAt).toBeNull();
    });
  });

  it("a verdict whose `approved` is not literally true never shares a place", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);
      const outcome = await (await placeActor(db, id)).applyReview(SYSTEM, {
        submittedAt,
        // A malformed answer that slipped past a seam: truthy, not `true`.
        review: { ...verdict(), approved: "yes" as unknown as boolean },
      });
      expect(outcome.status).toBe("rejected");
      expect((await rowOf(db, id))?.reviewStatus).toBe("rejected");
    });
  });

  it("suggestions are stored for the creator — filtered to the category list, minus what the place has — and never applied", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator, {
        categories: ["wine_bar"],
        description: null,
      });
      const { reviewer } = answering(
        verdict({
          suggestedCategories: [
            "cocktail_bar",
            "wine_bar", // already on the place
            "spaceship", // not a category anyone can pick
            "cocktail_bar", // repeated
            "restaurant",
          ],
          enrichedDescription: "  A snug natural-wine bar.  ",
        }),
      );
      await (await reviewActor(db, id, reviewer)).review(SYSTEM, {
        submittedAt,
      });

      const mine = await (await placeActor(db, id)).get(userCtx(creator, "r"));
      expect(mine.suggestedCategories).toEqual(["cocktail_bar", "restaurant"]);
      expect(mine.suggestedDescription).toBe("A snug natural-wine bar.");
      // Never applied on their own.
      expect(mine.categories).toEqual(["wine_bar"]);
      expect(mine.description).toBeNull();

      // The place is shared now, but the suggestions are not.
      const theirs = await (await placeActor(db, id)).get(
        userCtx(stranger, "r"),
      );
      expect(theirs.suggestedCategories).toEqual([]);
      expect(theirs.suggestedDescription).toBeNull();
    });
  });

  it("a description is never offered over the creator's own", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator, {
        description: "Our corner wine bar.",
      });
      const { reviewer } = answering(
        verdict({ enrichedDescription: "Something the model prefers." }),
      );
      await (await reviewActor(db, id, reviewer)).review(SYSTEM, {
        submittedAt,
      });
      const row = await rowOf(db, id);
      expect(row?.description).toBe("Our corner wine bar.");
      expect(row?.suggestedDescription).toBeNull();
    });
  });

  it("idempotent: a redelivery after the verdict, a stale submission and a deleted place are skipped — and cost no model call", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);

      const decided = await createPending(db, creator);
      const first = answering(verdict());
      await (await reviewActor(db, decided.id, first.reviewer)).review(SYSTEM, {
        submittedAt: decided.submittedAt,
      });
      const again = answering(verdict({ approved: false }));
      expect(
        await (await reviewActor(db, decided.id, again.reviewer)).review(
          SYSTEM,
          { submittedAt: decided.submittedAt },
        ),
      ).toMatchObject({ status: "skipped", reason: "decided" });
      expect(again.seen).toEqual([]);
      expect((await rowOf(db, decided.id))?.reviewStatus).toBe("approved");

      const stale = await createPending(db, creator, {
        location: { lng: SAN_FRANCISCO.lng + 0.05, lat: SAN_FRANCISCO.lat },
      });
      const staleReviewer = answering(verdict());
      expect(
        await (await reviewActor(db, stale.id, staleReviewer.reviewer)).review(
          SYSTEM,
          { submittedAt: new Date(0).toISOString() },
        ),
      ).toMatchObject({ status: "skipped", reason: "stale" });
      expect(staleReviewer.seen).toEqual([]);

      const gone = crypto.randomUUID();
      const goneReviewer = answering(verdict());
      expect(
        await (await reviewActor(db, gone, goneReviewer.reviewer)).review(
          SYSTEM,
          { submittedAt: new Date().toISOString() },
        ),
      ).toMatchObject({ status: "skipped", reason: "gone" });
      expect(goneReviewer.seen).toEqual([]);
    });
  });

  it("a verdict reached on what the creator has since edited is discarded — the edit's own review decides", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);

      // The model is thinking about the original submission…
      let release: (review: PlaceReview) => void = () => {};
      const slow: PlaceReviewer = () =>
        new Promise<PlaceReview>((resolve) => {
          release = resolve;
        });
      const pending = (await reviewActor(db, id, slow)).review(SYSTEM, {
        submittedAt,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      // …when the creator edits it.
      await (await placeActor(db, id)).editUnshared(
        userCtx(creator, "r-edit"),
        {
          name: fixtureName(),
          categories: ["bar"],
          location: SAN_FRANCISCO,
        },
      );
      release(verdict());
      expect(await pending).toMatchObject({
        status: "skipped",
        reason: "stale",
      });
      expect((await rowOf(db, id))?.reviewStatus).toBe("pending");
    });
  });

  it("approval re-checks against what is now shared: a shared twin that appeared meanwhile turns approval into a rejection naming it", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const name = fixtureName();
      const { id, submittedAt } = await createPending(db, creator, { name });
      // Somebody's identical place, already shared.
      const [twin] = await db
        .insert(places)
        .values({
          name,
          categories: ["bar"],
          location: SAN_FRANCISCO,
          source: "overture",
        })
        .returning({ id: places.id });

      const { reviewer } = answering(verdict());
      const outcome = await (await reviewActor(db, id, reviewer)).review(
        SYSTEM,
        { submittedAt },
      );
      expect(outcome).toMatchObject({
        status: "rejected",
        reason: "duplicate",
      });
      const row = await rowOf(db, id);
      expect(row?.reviewStatus).toBe("rejected");
      expect(row?.rejectionReason).toMatch(/already on the map/);
      expect(twin?.id).toBeDefined();
    });
  });

  it("B5b, carried over: with `review` omitted the actor takes the *installed* reviewer, not the throwing stub", async () => {
    // Dapr builds every actor as `new ActorCls(daprClient, actorId)`, so a
    // constructor parameter's *default* is production's only wiring. B5b
    // shipped with the stub there and every real review failed while every
    // test — each injecting its own reviewer — stayed green. Omitting the
    // argument is the whole assertion.
    await withTestDb(async (db) => {
      const seen: string[] = [];
      setPlaceReviewer(async (_ctx, subject) => {
        seen.push(subject.name);
        return verdict({ confidenceAdjustment: 0.3 });
      });
      try {
        const creator = await seedUser(db);
        const name = fixtureName();
        const { id, submittedAt } = await createPending(db, creator, { name });
        const outcome = await (await reviewActor(db, id)).review(SYSTEM, {
          submittedAt,
        });
        expect(seen).toEqual([name]);
        expect(outcome.status).toBe("approved");
      } finally {
        setPlaceReviewer(unconfiguredPlaceReviewer);
      }
    });
  });

  it("an admin may deliver a review by hand — the repair path for a dead-lettered one", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const admin = await seedUser(db);
      const { id, submittedAt } = await createPending(db, creator);
      const { reviewer } = answering(verdict());
      const outcome = await (await reviewActor(db, id, reviewer)).review(
        adminCtx(admin, "r-admin"),
        { submittedAt },
      );
      expect(outcome.status).toBe("approved");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Two approvals at once: the geocell locks, where X27 moved them              */
/* -------------------------------------------------------------------------- */

/** Resolves when `n` callers have arrived, or after `timeoutMs`. */
const rendezvous = (n: number, timeoutMs?: number) => {
  let arrived = 0;
  let release: () => void = () => {};
  const all = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async (): Promise<void> => {
    arrived += 1;
    if (arrived === n) release();
    await (timeoutMs === undefined
      ? all
      : Promise.race([
          all,
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]));
  };
};

/** Two points about a metre apart, in different geocells. */
const straddlingPair = (start: { lng: number; lat: number }) => {
  const METRE_OF_LNG = 1 / (111_320 * Math.cos((start.lat * Math.PI) / 180));
  let a = start;
  let b = { lng: a.lng + METRE_OF_LNG, lat: a.lat };
  while (geocellOf(b).col === geocellOf(a).col) {
    a = b;
    b = { lng: a.lng + METRE_OF_LNG, lat: a.lat };
  }
  return { a, b };
};

describe.skipIf(skip)("two approvals of one venue at once (X27)", () => {
  /**
   * Since X27 two users can each hold a pending copy of the same bar — telling
   * either about the other's would be the oracle D28 forbids — so "exactly one
   * shared row per venue" is enforced when a place is *shared*.
   * `applyReview` takes the same geocell advisory locks `PlaceActor.create`
   * does and re-runs the duplicate check against shared places under them.
   *
   * Each approval runs in its own real top-level transaction. The rendezvous
   * holds each open after its UPDATE until the other has updated too — so
   * without the locks both re-checks see nothing shared and both commit; with
   * them the second approval is parked on the lock, then sees the first one's
   * committed approval and turns into a rejection naming it.
   */
  const HOLD_MS = 750;

  const raceTwoApprovals = async (locations: {
    readonly a: { lng: number; lat: number };
    readonly b: { lng: number; lat: number };
  }) => {
    const name = fixtureName();
    const users = [await seedUser(testDb()), await seedUser(testDb())];
    // Each created in its own committed transaction, with its queued review
    // row deleted before the commit: a committed `pending` outbox row is
    // claimable by another file's drain test running at the same moment.
    const createCommitted = (user: string, location: typeof locations.a) =>
      testDb().transaction(async (tx) => {
        const made = await createPending(tx, user, { name, location });
        await tx.execute(
          sql`delete from outbox where target_actor = 'PlaceReviewActor' and target_id = ${made.id}`,
        );
        return made;
      });
    const created = [
      await createCommitted(users[0] ?? "", locations.a),
      await createCommitted(users[1] ?? "", locations.b),
    ];
    const beforeCommit = rendezvous(2, HOLD_MS);
    const approve = (placeId: string, submittedAt: string) =>
      testDb().transaction(async (tx) => {
        const actor = await placeActor(tx, placeId);
        const outcome = await actor.applyReview(SYSTEM, {
          submittedAt,
          review: verdict(),
        });
        await beforeCommit();
        return outcome;
      });

    try {
      const outcomes = await Promise.all(
        created.map((c) => approve(c.id, c.submittedAt)),
      );
      const rows = await testDb()
        .select({ id: places.id, status: places.reviewStatus })
        .from(places)
        .where(eq(places.name, name));
      return { outcomes, rows };
    } finally {
      await testDb().delete(places).where(eq(places.name, name));
      for (const user of users) {
        await testDb().execute(
          sql`delete from "user" where id = ${user}::uuid`,
        );
      }
    }
  };

  const expectOneShared = (
    result: Awaited<ReturnType<typeof raceTwoApprovals>>,
  ) => {
    expect(result.outcomes.map((o) => o.status).sort()).toEqual([
      "approved",
      "rejected",
    ]);
    expect(result.rows.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(result.rows.filter((r) => r.status === "rejected")).toHaveLength(1);
  };

  it("two pending copies of one bar approved at once, in real concurrent transactions → exactly one is shared", async () => {
    expectOneShared(
      await raceTwoApprovals({ a: SAN_FRANCISCO, b: SAN_FRANCISCO }),
    );
  }, 30_000);

  it("…and still when the two copies sit a metre apart on either side of a geocell boundary", async () => {
    const { a, b } = straddlingPair(SAN_FRANCISCO);
    expect(geocellOf(a)).not.toEqual(geocellOf(b));
    expectOneShared(await raceTwoApprovals({ a, b }));
  }, 30_000);
});
