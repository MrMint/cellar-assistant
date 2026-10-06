/**
 * `PlaceCreationActor` against a real Postgres (B5, migration plan §2.1, §1.2).
 *
 * `createActor` (`src/lib/testing.ts`) forwards three constructor arguments, so
 * — exactly as `brand-registry-actor.test.ts` does for its `BrandCreator` —
 * this file supplies the two extra seams itself. `inProcessCreator` wires the
 * registry to a real, in-process `PlaceActor` sharing the caller's own
 * transaction rather than a Dapr sidecar hop.
 *
 * ## Why the concurrency test does not use `withTestDb`
 *
 * `withTestDb` runs the whole body inside one outer transaction and rolls it
 * back; every actor's `this.tx()` opens a savepoint inside it. That cannot
 * produce genuine contention — one session, serialized by definition. The
 * acceptance test for "concurrent creates converge on one row" therefore opens
 * N independent, real `testDb().transaction(...)` calls via `Promise.all`, and
 * cleans up for real afterwards, because nothing there is rolled back.
 *
 * ## `places` is empty in this database
 *
 * A3's transform restores a schema-only dump, so every fixture here is created
 * by the actor under test or by a direct insert inside the rolled-back
 * transaction.
 */
import type { PlaceReview } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  PLACE_RATE_LIMIT_PER_DAY,
  placeCreationActorId,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { places } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { geocellOf } from "../lib/geocell.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDb,
  withTestDb,
} from "../lib/testing.ts";
import { PlaceActor } from "./place-actor.ts";
import type {
  PlaceCreator,
  PlaceReviewer,
  PlaceReviewSubject,
} from "./place-creation-actor.ts";
import {
  confidenceFromReview,
  PlaceCreationActor,
  setPlaceReviewer,
  unconfiguredPlaceReviewer,
} from "./place-creation-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** The production path, pointed at an in-process `PlaceActor` sharing `db`. */
const inProcessCreator =
  (db: DbOrTx): PlaceCreator =>
  async (ctx, placeId, input) => {
    const actor = await activate(
      new PlaceActor(daprClient(), new ActorId(placeId), db),
    );
    return actor.create(ctx, input);
  };

const approves = (overrides: Partial<PlaceReview> = {}): PlaceReviewer => {
  const review: PlaceReview = {
    approved: true,
    confidenceAdjustment: 0.2,
    flags: [],
    ...overrides,
  };
  return async () => review;
};

/** Keyed as production keys it: `placeCreationActorId(viewerId)`. */
const newCreationActor = (
  db: DbOrTx,
  viewerId: string,
  seams: { create?: PlaceCreator; review?: PlaceReviewer } = {},
): PlaceCreationActor =>
  new PlaceCreationActor(
    daprClient(),
    new ActorId(placeCreationActorId(viewerId)),
    db,
    seams.create ?? inProcessCreator(db),
    seams.review ?? unconfiguredPlaceReviewer,
  );

const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

let seq = 0;
/** Unique per call, so a real-commit test never collides with another run. */
const fixtureName = (): string => {
  seq += 1;
  return `B5 Fixture ${Date.now().toString(36)}-${seq}`;
};

const baseInput = (name: string) => ({
  name,
  categories: ["wine_bar", "bar"],
  location: SAN_FRANCISCO,
});

const { skip } = await resolveTestDatabase();

// One pool for both describes below, closed once after both.
afterAll(closeTestDb);

describe.skipIf(skip)("PlaceCreationActor (B5)", () => {
  it("is tagged entity (§2.1: registry, entity category, no owned table)", () => {
    expect(PlaceCreationActor.category).toBe("entity");
  });

  /* ---------------------------------------------------------------------- */
  /* Viewers                                                                 */
  /* ---------------------------------------------------------------------- */

  it("createPlace: anonymous is refused, and so is `system` — a place is always created by someone", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(newCreationActor(db, viewer));
      await expect(
        actor.createPlace(anonymousCtx("r-anon"), baseInput(fixtureName())),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.createPlace(systemCtx("r-sys"), baseInput(fixtureName())),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("createPlace: owner, a second user and a stranger may each create their own place", async () => {
    await withTestDb(async (db) => {
      for (const _ of [0, 1, 2]) {
        const viewer = await seedUser(db);
        const actor = await activate(
          newCreationActor(db, viewer, { review: approves() }),
        );
        const result = await actor.createPlace(
          userCtx(viewer, `r-${viewer}`),
          baseInput(fixtureName()),
        );
        expect(result.place.createdById).toBe(viewer);
        expect(result.place.source).toBe("user");
      }
    });
  });

  it("createPlace: the key is an address, not a credential — a ctx for anyone but the keyed viewer is refused before the rate limit is read", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const intruder = await seedUser(db);
      const reviewed: string[] = [];
      const actor = await activate(
        newCreationActor(db, owner, {
          review: async (_ctx, subject) => {
            reviewed.push(subject.name);
            return { approved: true, confidenceAdjustment: 0, flags: [] };
          },
        }),
      );
      // Someone else's user ctx, and an admin's — §1.6's bypass is about
      // seeing rows, not about becoming somebody else.
      for (const ctx of [
        userCtx(intruder, "r-intruder"),
        adminCtx(intruder, "r-admin"),
      ]) {
        await expect(
          actor.createPlace(ctx, baseInput(fixtureName())),
        ).rejects.toThrow(/creates places only for that user/);
      }
      expect(reviewed).toEqual([]);
      const created = await db
        .select({ id: places.id })
        .from(places)
        .where(eq(places.createdBy, intruder));
      expect(created).toEqual([]);

      // The owner, at their own key, is served.
      const own = await actor.createPlace(
        userCtx(owner, "r-own"),
        baseInput(fixtureName()),
      );
      expect(own.place.createdById).toBe(owner);
    });
  });

  it("findDuplicates: anonymous is refused; a signed-in viewer gets the nearby row", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        newCreationActor(db, viewer, { review: approves() }),
      );
      const name = fixtureName();
      await actor.createPlace(userCtx(viewer, "r1"), baseInput(name));

      await expect(
        actor.findDuplicates(anonymousCtx("r-anon"), {
          name,
          location: SAN_FRANCISCO,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const found = await actor.findDuplicates(userCtx(viewer, "r2"), {
        name,
        location: SAN_FRANCISCO,
      });
      expect(found.map((d) => d.name)).toContain(name);
      expect(found[0]?.similarity).toBeGreaterThan(0.3);
      expect(found[0]?.distanceMeters).toBeLessThan(1);

      // A one-character query matches everything, so it is not run at all.
      expect(
        await actor.findDuplicates(userCtx(viewer, "r3"), {
          name: "x",
          location: SAN_FRANCISCO,
        }),
      ).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The pipeline                                                            */
  /* ---------------------------------------------------------------------- */

  it("createPlace: holds the lock and delegates — it never inserts itself (§1.2)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const calls: string[] = [];
      const creator: PlaceCreator = async (ctx, placeId, input) => {
        calls.push(placeId);
        return inProcessCreator(db)(ctx, placeId, input);
      };
      const actor = await activate(
        newCreationActor(db, viewer, { create: creator, review: approves() }),
      );

      const result = await actor.createPlace(
        userCtx(viewer, "r"),
        baseInput(fixtureName()),
      );
      expect(calls).toEqual([result.place.id]);
    });
  });

  it("createPlace: refuses a very similar place within 50m, and reports the near-misses it allowed", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        newCreationActor(db, viewer, { review: approves() }),
      );
      const name = fixtureName();

      const first = await actor.createPlace(
        userCtx(viewer, "r1"),
        baseInput(name),
      );
      expect(first.nearbyDuplicates).toEqual([]);

      await expect(
        actor.createPlace(userCtx(viewer, "r2"), baseInput(name)),
      ).rejects.toBeInstanceOf(ConflictError);

      // ~1.4km north: past the 50m block, inside the 200m search? No — the
      // search radius is 200m too, so this one sees nothing at all and is
      // simply allowed.
      const far = await actor.createPlace(userCtx(viewer, "r3"), {
        ...baseInput(name),
        location: { lng: SAN_FRANCISCO.lng, lat: SAN_FRANCISCO.lat + 0.0125 },
      });
      expect(far.place.id).not.toBe(first.place.id);
    });
  });

  it("createPlace: an unapproved review is a ValidationError carrying its reason", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        newCreationActor(db, viewer, {
          review: approves({
            approved: false,
            rejectionReason: "this looks like a private residence",
          }),
        }),
      );
      await expect(
        actor.createPlace(userCtx(viewer, "r"), baseInput(fixtureName())),
      ).rejects.toThrow(/private residence/);
    });
  });

  it("createPlace: the unconfigured reviewer degrades to review: null and the neutral confidence", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(newCreationActor(db, viewer));
      const result = await actor.createPlace(
        userCtx(viewer, "r"),
        baseInput(fixtureName()),
      );
      expect(result.review).toBeNull();
      expect(result.place.confidence).toBe(0.5);
    });
  });

  it("createPlace: an approving review sets the confidence and can supply the description", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        newCreationActor(db, viewer, {
          review: approves({
            confidenceAdjustment: 0.9, // clamped to +0.3 → 0.8
            enrichedDescription: "A snug natural-wine bar.",
          }),
        }),
      );
      const result = await actor.createPlace(
        userCtx(viewer, "r"),
        baseInput(fixtureName()),
      );
      expect(result.place.confidence).toBe(0.8);
      expect(result.place.description).toBe("A snug natural-wine bar.");
      expect(result.review?.approved).toBe(true);
    });
  });

  it("B5b: with `review` omitted the actor takes the *installed* reviewer, not the throwing stub", async () => {
    // The one test in this file that does not pass its own reviewer, and the
    // only one that could ever have caught the shipped bug.
    //
    // Dapr's `ActorManager` builds every actor as
    // `new ActorCls(daprClient, actorId)` and offers no factory hook, so a
    // constructor parameter's *default* is production's only wiring. The
    // version that shipped named `unconfiguredPlaceReviewer` there: every real
    // activation threw, `#reviewOrNull` swallowed it, every creation took the
    // `review: null` path — and the suite stayed green, because every test
    // above injects a reviewer explicitly and so never reads the default.
    //
    // Omitting the argument is therefore the whole assertion. X5 fixed the
    // identical defect in `GeocodeActor` (`unconfiguredPhotonClient` as the
    // default) and `geocode-actor.test.ts` carries the same shape of test.
    await withTestDb(async (db) => {
      const seen: PlaceReviewSubject[] = [];
      setPlaceReviewer(async (_ctx, subject) => {
        seen.push(subject);
        return {
          approved: true,
          confidenceAdjustment: 0.3,
          enrichedDescription: "Installed at boot, as installAI() does.",
          flags: [],
        };
      });
      try {
        const viewer = await seedUser(db);
        const actor = await activate(
          new PlaceCreationActor(
            daprClient(),
            new ActorId(placeCreationActorId(viewer)),
            db,
            inProcessCreator(db),
            // `review` deliberately omitted — the point of this test.
          ),
        );
        const name = fixtureName();
        const result = await actor.createPlace(
          userCtx(viewer, "r"),
          baseInput(name),
        );

        // The installed reviewer ran, on this submission…
        expect(seen.map((subject) => subject.name)).toEqual([name]);
        // …and its verdict reached both the result and the row. With the stub
        // as the default these three are `null`, `0.5` and `null`.
        expect(result.review?.approved).toBe(true);
        expect(result.place.confidence).toBe(0.8);
        expect(result.place.description).toBe(
          "Installed at boot, as installAI() does.",
        );
      } finally {
        setPlaceReviewer(unconfiguredPlaceReviewer);
      }
    });
  });

  it("confidenceFromReview clamps the adjustment and the result", () => {
    expect(confidenceFromReview(null)).toBe(0.5);
    const review = (adjustment: number): PlaceReview => ({
      approved: true,
      confidenceAdjustment: adjustment,
      flags: [],
    });
    expect(confidenceFromReview(review(0))).toBe(0.5);
    expect(confidenceFromReview(review(5))).toBe(0.8);
    expect(confidenceFromReview(review(-5))).toBe(0.2);
    expect(confidenceFromReview(review(Number.NaN))).toBe(0.5);
  });

  it("createPlace: rejects a caller-chosen confidence, a bad website and an over-long description", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const ctx = userCtx(viewer, "r");
      const actor = await activate(
        newCreationActor(db, viewer, { review: approves() }),
      );

      await expect(
        actor.createPlace(ctx, {
          ...baseInput(fixtureName()),
          confidence: 0.99,
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        actor.createPlace(ctx, {
          ...baseInput(fixtureName()),
          website: "not a url at all",
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        actor.createPlace(ctx, {
          ...baseInput(fixtureName()),
          description: "x".repeat(1001),
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      // A bare host is the create form's convenience, and survives.
      const ok = await actor.createPlace(ctx, {
        ...baseInput(fixtureName()),
        website: " example.com ",
      });
      expect(ok.place.website).toBe("https://example.com/");
    });
  });

  it(`createPlace: refuses the ${PLACE_RATE_LIMIT_PER_DAY}th+1 place in 24h, and never rate-limits an admin`, async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      // Seeded directly: the rate limit counts rows, not calls, and 25 trips
      // through the pipeline would just be slow.
      await db.insert(places).values(
        Array.from({ length: PLACE_RATE_LIMIT_PER_DAY }, (_, index) => ({
          name: `${fixtureName()} ${index}`,
          categories: ["bar"],
          // Spread far apart so the duplicate check never sees them.
          location: { lng: -122.4194 + index * 0.05, lat: 37.7749 },
          createdBy: viewer,
          source: "user",
        })),
      );
      const actor = await activate(
        newCreationActor(db, viewer, { review: approves() }),
      );

      await expect(
        actor.createPlace(userCtx(viewer, "r"), baseInput(fixtureName())),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // `bypassesPolicy` — an admin repairing data is not a user adding bars.
      const asAdmin = await actor.createPlace(
        adminCtx(viewer, "r-admin"),
        baseInput(fixtureName()),
      );
      expect(asAdmin.place.createdById).toBe(viewer);

      // The bucket is the user's own: someone else, at their own key, is
      // unaffected by this user having used all 25.
      const other = await seedUser(db);
      const theirs = await activate(
        newCreationActor(db, other, { review: approves() }),
      );
      const allowed = await theirs.createPlace(userCtx(other, "r-other"), {
        ...baseInput(fixtureName()),
        // Away from the admin's row above: a near-identical fixture name at
        // the same point is a duplicate, which is not what this checks.
        location: { lng: SAN_FRANCISCO.lng, lat: SAN_FRANCISCO.lat + 0.05 },
      });
      expect(allowed.place.createdById).toBe(other);
    });
  });

  it("createPlace: geography round-trips as { lng, lat } through the registry", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        newCreationActor(db, viewer, { review: approves() }),
      );
      const location = { lng: -122.8, lat: 38.0668 };
      const result = await actor.createPlace(userCtx(viewer, "r"), {
        ...baseInput(fixtureName()),
        location,
      });
      expect(result.place.location).toEqual(location);

      const raw = await db.execute<{ wkt: string }>(sql`
        select st_astext(location) as wkt from places where id = ${result.place.id}::uuid
      `);
      expect(raw.rows[0]?.wkt).toBe("POINT(-122.8 38.0668)");
    });
  });

  it("createPlace: a re-submitted placeId returns the same row, and google_place_id stays null", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        newCreationActor(db, viewer, { review: approves() }),
      );
      const placeId = crypto.randomUUID();
      const input = { ...baseInput(fixtureName()), placeId };

      const first = await actor.createPlace(userCtx(viewer, "r1"), input);
      const second = await actor.createPlace(userCtx(viewer, "r2"), input);
      expect(second.place.id).toBe(first.place.id);
      expect(second.place.googlePlaceId).toBeNull();

      const rows = await db
        .select({ id: places.id })
        .from(places)
        .where(eq(places.id, placeId));
      expect(rows).toHaveLength(1);
    });
  });

  it("createPlace: converges when PlaceActor.create reports a conflict it did not see coming", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = crypto.randomUUID();

      // Someone else's row is already committed under this id, and the
      // injected creator reports exactly what `PlaceActor.create` translates a
      // `places_pkey` violation into.
      const winner = await activate(
        new PlaceActor(daprClient(), new ActorId(placeId), db),
      );
      const winnerRow = await winner.create(userCtx(viewer, "r0"), {
        ...baseInput(fixtureName()),
        createdById: viewer,
      });

      const alwaysConflicts: PlaceCreator = async () => {
        throw new ConflictError(`place ${placeId} was created concurrently`);
      };
      const actor = await activate(
        newCreationActor(db, viewer, {
          create: alwaysConflicts,
          review: approves(),
        }),
      );
      const result = await actor.createPlace(userCtx(viewer, "r1"), {
        ...baseInput(fixtureName()),
        placeId,
      });
      expect(result.place.id).toBe(winnerRow.id);
    });
  });

  it("createPlace: re-throws a non-conflict failure from create() rather than masking it", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const boom = new Error("sidecar unreachable");
      const actor = await activate(
        newCreationActor(db, viewer, {
          create: async () => {
            throw boom;
          },
          review: approves(),
        }),
      );
      await expect(
        actor.createPlace(userCtx(viewer, "r"), baseInput(fixtureName())),
      ).rejects.toBe(boom);
    });
  });

  /**
   * The acceptance proof (handover: "concurrent creates of the same place
   * converge on one row, proven with real concurrent transactions"). See the
   * module doc for why it cannot run inside `withTestDb`.
   *
   * "The same place" is the same *creation*: §8.4's idempotency key, the
   * client-minted `placeId` a retried submit carries. Each call is its own
   * top-level transaction against the real pool and its own actor activation,
   * so nothing here is coordinated in process — except one thing, deliberately.
   *
   * ## Why there is a barrier
   *
   * Without one the test is weaker than it looks. `Promise.all` starts all N,
   * but the pool hands out connections in order and each turn runs ~9 queries
   * before its INSERT, so in practice the first transaction commits while the
   * rest are still on their pre-checks — every loser then short-circuits on an
   * already-committed row and `places_pkey` is never touched. That converges,
   * but it proves the *easy* path. The barrier releases all N into
   * `PlaceActor.create` at once so their INSERTs genuinely collide, which is
   * the case a rolling deploy or a placement-table update actually produces.
   *
   * `CONCURRENCY` stays under node-postgres's default pool size of 10:
   * a barrier waiting on more transactions than there are connections would
   * deadlock rather than fail.
   */
  it("8 simultaneous createPlace calls carrying one placeId — real, independent Postgres transactions, released into the INSERT together — converge on exactly one row", async () => {
    const placeId = crypto.randomUUID();
    const name = fixtureName();
    const CONCURRENCY = 8;

    const viewer = await seedUser(testDb());
    const input = { ...baseInput(name), placeId };

    let arrived = 0;
    let release: () => void = () => {};
    const allArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    const barrier = async (): Promise<void> => {
      arrived += 1;
      if (arrived === CONCURRENCY) release();
      await allArrived;
    };

    // How each turn came out. `converged` is a turn whose INSERT lost the
    // `places_pkey` race and was handed back a typed `ConflictError` to re-read
    // from; `settled` is the winner plus anything that got there late enough to
    // see the committed row.
    const outcome = { settled: 0, converged: 0 };
    const barrieredCreator =
      (db: DbOrTx): PlaceCreator =>
      async (ctx, id, createInput) => {
        await barrier();
        try {
          const created = await inProcessCreator(db)(ctx, id, createInput);
          outcome.settled += 1;
          return created;
        } catch (error) {
          if (error instanceof ConflictError) outcome.converged += 1;
          throw error;
        }
      };

    const attempt = () =>
      testDb().transaction(async (tx) => {
        const actor = await activate(
          newCreationActor(tx, viewer, {
            create: barrieredCreator(tx),
            review: approves(),
          }),
        );
        return actor.createPlace(userCtx(viewer, `r-${placeId}`), input);
      });

    try {
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => attempt()),
      );

      const ids = new Set(results.map((r) => r.place.id));
      expect(ids.size).toBe(1);
      expect([...ids][0]).toBe(placeId);
      // The tripwire really fired: at least one INSERT lost the race and came
      // back through `#createOrConverge` rather than through a short-circuit.
      expect(outcome.converged).toBeGreaterThan(0);
      expect(outcome.settled + outcome.converged).toBe(CONCURRENCY);

      const rows = await testDb()
        .select({ id: places.id, googlePlaceId: places.googlePlaceId })
        .from(places)
        .where(eq(places.id, placeId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.googlePlaceId).toBeNull();

      console.log(
        `[B5 acceptance] ${CONCURRENCY} simultaneous createPlace, one placeId: ` +
          `${outcome.converged} converged via places_pkey, ` +
          `${outcome.settled} settled without a collision; ` +
          `${ids.size} distinct id returned, ${rows.length} row in places, ` +
          `google_place_id=${String(rows[0]?.googlePlaceId)}`,
      );
    } finally {
      // Real commits, so real cleanup — nothing here rolls back.
      await testDb().delete(places).where(eq(places.id, placeId));
      await testDb().execute(
        sql`delete from "user" where id = ${viewer}::uuid`,
      );
    }
  }, 60_000);
});

/* -------------------------------------------------------------------------- */
/* Wave 6: keyed per creator, duplicates closed by geocell locks               */
/* -------------------------------------------------------------------------- */

/** Resolves when `n` callers have arrived, or after `timeoutMs`, whichever is first. */
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

/**
 * Two points a metre or so apart that fall in different geocells: walk east
 * from `start` a metre at a time until the column changes.
 */
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

describe.skipIf(skip)("PlaceCreationActor keyed per creator (Wave 6)", () => {
  /**
   * The race the singleton used to close, and that the geocell locks inside
   * `PlaceActor.create` close now. Two *different* users, so two different
   * activations (`placeCreationActorId(viewer)`), each in its own real
   * top-level transaction — nothing in process serialises them.
   *
   * ## The two rendezvous, and why the second has a timeout
   *
   * `beforeCreate` releases both into `PlaceActor.create` together, after
   * both have passed the early duplicate check (neither can see a row yet).
   * `beforeCommit` then holds each transaction open after its INSERT until
   * the other has also inserted — so *without* the locks both INSERTs are
   * uncommitted when both rechecks run, and both commit: two rows, every time.
   * *With* the locks the second creator is parked on `pg_advisory_xact_lock`
   * and never reaches `beforeCommit`, so the first gives up waiting after
   * `HOLD_MS`, commits, releases its locks, and the second's recheck sees the
   * committed row. The timeout is what keeps the correct version from
   * deadlocking against the test's own barrier.
   */
  const HOLD_MS = 750;

  const raceTwoCreators = async (locations: {
    readonly a: { lng: number; lat: number };
    readonly b: { lng: number; lat: number };
  }) => {
    const name = fixtureName();
    const users = [await seedUser(testDb()), await seedUser(testDb())];
    const beforeCreate = rendezvous(2);
    const beforeCommit = rendezvous(2, HOLD_MS);
    const creatorFor =
      (db: DbOrTx): PlaceCreator =>
      async (ctx, id, input) => {
        await beforeCreate();
        const created = await inProcessCreator(db)(ctx, id, input);
        await beforeCommit();
        return created;
      };
    const attempt = (viewer: string, location: { lng: number; lat: number }) =>
      testDb().transaction(async (tx) => {
        const actor = await activate(
          newCreationActor(tx, viewer, {
            create: creatorFor(tx),
            review: approves(),
          }),
        );
        return actor.createPlace(userCtx(viewer, `r-${viewer}`), {
          ...baseInput(name),
          location,
        });
      });

    try {
      const settled = await Promise.allSettled([
        attempt(users[0] ?? "", locations.a),
        attempt(users[1] ?? "", locations.b),
      ]);
      const rows = await testDb()
        .select({ id: places.id, createdBy: places.createdBy })
        .from(places)
        .where(eq(places.name, name));
      return { settled, rows };
    } finally {
      await testDb().delete(places).where(eq(places.name, name));
      for (const user of users) {
        await testDb().execute(
          sql`delete from "user" where id = ${user}::uuid`,
        );
      }
    }
  };

  const expectOnePlaceAndOneDuplicate = (
    outcome: Awaited<ReturnType<typeof raceTwoCreators>>,
  ) => {
    const fulfilled = outcome.settled.filter((r) => r.status === "fulfilled");
    const rejected = outcome.settled.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(outcome.rows).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The same outcome a user got from the singleton: a ConflictError naming
    // the place that already exists.
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
    expect(String(rejected[0]?.reason?.message)).toMatch(
      new RegExp(`a very similar place .* it is place ${outcome.rows[0]?.id}`),
    );
  };

  it("two users creating the same place at once, in different activations and real concurrent transactions → exactly one place, and the other is told it is a duplicate", async () => {
    expectOnePlaceAndOneDuplicate(
      await raceTwoCreators({ a: SAN_FRANCISCO, b: SAN_FRANCISCO }),
    );
  }, 30_000);

  it("two near-duplicates a metre apart on either side of a geocell boundary are still caught", async () => {
    const { a, b } = straddlingPair(SAN_FRANCISCO);
    expect(geocellOf(a)).not.toEqual(geocellOf(b));
    expectOnePlaceAndOneDuplicate(await raceTwoCreators({ a, b }));
  }, 30_000);

  /**
   * What the re-key buys. Dapr runs one turn at a time per actor id; the
   * harness has no sidecar, so `turn` below reproduces exactly that guarantee
   * in process (a promise chain per key) and nothing more.
   *
   * User A's AI review hangs. User B's creation — a different place, a
   * different key — completes anyway; under the old singleton it would have
   * waited out A's review (up to 120s). A's *own* second submission does wait,
   * which is the per-user serialisation the rate limit relies on.
   */
  it("different users' creations do not block each other: B completes while A's AI review hangs, and A's own next submission waits for it", async () => {
    await withTestDb(async (db) => {
      const turns = new Map<string, Promise<unknown>>();
      const turn = <T>(key: string, body: () => Promise<T>): Promise<T> => {
        const previous = turns.get(key) ?? Promise.resolve();
        const next = previous.then(body, body);
        turns.set(
          key,
          next.catch(() => undefined),
        );
        return next;
      };

      const userA = await seedUser(db);
      const userB = await seedUser(db);
      let unblockA: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        unblockA = resolve;
      });
      const aReviewStarted = rendezvous(1);
      const hangingReview: PlaceReviewer = async () => {
        await aReviewStarted();
        await gate;
        return { approved: true, confidenceAdjustment: 0, flags: [] };
      };
      const actorA = await activate(
        newCreationActor(db, userA, { review: hangingReview }),
      );
      const actorB = await activate(
        newCreationActor(db, userB, { review: approves() }),
      );

      let aDone = false;
      let aSecondDone = false;
      const first = turn(placeCreationActorId(userA), () =>
        actorA.createPlace(userCtx(userA, "r-a1"), baseInput(fixtureName())),
      ).then((result) => {
        aDone = true;
        return result;
      });
      const second = turn(placeCreationActorId(userA), () =>
        actorA.createPlace(userCtx(userA, "r-a2"), {
          ...baseInput(fixtureName()),
          location: { lng: SAN_FRANCISCO.lng + 0.05, lat: SAN_FRANCISCO.lat },
        }),
      ).then((result) => {
        aSecondDone = true;
        return result;
      });
      await aReviewStarted();

      const started = performance.now();
      const b = await turn(placeCreationActorId(userB), () =>
        actorB.createPlace(userCtx(userB, "r-b"), {
          ...baseInput(fixtureName()),
          location: { lng: SAN_FRANCISCO.lng + 0.1, lat: SAN_FRANCISCO.lat },
        }),
      );
      const elapsed = performance.now() - started;

      expect(b.place.createdById).toBe(userB);
      expect(aDone).toBe(false);
      expect(aSecondDone).toBe(false);
      console.log(
        `[W6 fan-out] B's createPlace completed in ${elapsed.toFixed(1)}ms ` +
          "while A's AI review was hung and A's own second submission queued",
      );

      unblockA();
      const [aFirst, aSecond] = await Promise.all([first, second]);
      expect(aFirst.place.createdById).toBe(userA);
      expect(aSecond.place.createdById).toBe(userA);
    });
  }, 30_000);
});
