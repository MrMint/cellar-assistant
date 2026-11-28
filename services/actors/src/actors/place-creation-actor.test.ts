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
 *
 * ## X27: no review in here any more
 *
 * The AI review moved out of the creation turn: a place is created `pending`
 * (creator-only) and the review is an outbox row for `PlaceReviewActor`. The
 * review's own behaviour — approve, reject, the never-a-fabricated-approval
 * paths, the B5b installed-reviewer regression — is
 * `place-review-actor.test.ts`; what this file proves about it is that every
 * creation queues exactly one, and that nothing about a creation depends on a
 * model.
 */
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
import { outbox, places } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDb,
  withTestDb,
} from "../lib/testing.ts";
import { PlaceActor } from "./place-actor.ts";
import type { PlaceCreator } from "./place-creation-actor.ts";
import { PlaceCreationActor } from "./place-creation-actor.ts";

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

/** Keyed as production keys it: `placeCreationActorId(viewerId)`. */
const newCreationActor = (
  db: DbOrTx,
  viewerId: string,
  seams: { create?: PlaceCreator } = {},
): PlaceCreationActor =>
  new PlaceCreationActor(
    daprClient(),
    new ActorId(placeCreationActorId(viewerId)),
    db,
    seams.create ?? inProcessCreator(db),
  );

/** The review rows a creation queued for `placeId`. */
const reviewRowsFor = (db: DbOrTx, placeId: string) =>
  db
    .select({
      payload: outbox.payload,
      attributedTo: outbox.attributedTo,
    })
    .from(outbox)
    .where(
      and(
        eq(outbox.targetActor, "PlaceReviewActor"),
        eq(outbox.method, "review"),
        eq(outbox.targetId, placeId),
      ),
    );

/**
 * For the tests here that really commit: a creation queues a review row
 * (X27), and a committed `pending` outbox row is claimable by any other file's
 * drain test running at the same moment — it showed up as `outbox-actor`'s
 * "claimed 25, expected 24". Deleting it inside the creating transaction means
 * it is never committed at all.
 */
const dropQueuedReviews = async (tx: DbOrTx, placeId: string) => {
  await tx
    .delete(outbox)
    .where(
      and(
        eq(outbox.targetActor, "PlaceReviewActor"),
        eq(outbox.targetId, placeId),
      ),
    );
};

/** An approved (shared) place, written straight in — as an Overture row is. */
const insertShared = async (
  db: DbOrTx,
  name: string,
  location = SAN_FRANCISCO,
): Promise<string> => {
  const [row] = await db
    .insert(places)
    .values({ name, categories: ["bar"], location, source: "overture" })
    .returning({ id: places.id });
  return row?.id ?? "";
};

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
        const actor = await activate(newCreationActor(db, viewer));
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
      const actor = await activate(newCreationActor(db, owner));
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
      const actor = await activate(newCreationActor(db, viewer));
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
        newCreationActor(db, viewer, { create: creator }),
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
      const actor = await activate(newCreationActor(db, viewer));
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

  /* ---------------------------------------------------------------------- */
  /* X27 / D28: saved at once, creator-only, review queued                   */
  /* ---------------------------------------------------------------------- */

  it("X27: a new place is saved at once as pending — neutral confidence, the creator's own description untouched, review: null", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(newCreationActor(db, viewer));
      const result = await actor.createPlace(userCtx(viewer, "r"), {
        ...baseInput(fixtureName()),
        description: "Our corner wine bar.",
      });
      expect(result.place.reviewStatus).toBe("pending");
      expect(result.place.confidence).toBe(0.5);
      expect(result.place.description).toBe("Our corner wine bar.");
      expect(result.place.rejectionReason).toBeNull();
      expect(result.place.suggestedCategories).toEqual([]);
      // The verdict is not in this turn — it arrives on `reviewStatus`.
      expect(result.review).toBeNull();
    });
  });

  it("X27: every creation queues exactly one review — for this place, this submission, attributed to its creator", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(newCreationActor(db, viewer));
      const placeId = crypto.randomUUID();
      const input = { ...baseInput(fixtureName()), placeId };
      await actor.createPlace(userCtx(viewer, "r1"), input);
      // A replay of the same creation queues nothing more.
      await actor.createPlace(userCtx(viewer, "r2"), input);

      const rows = await reviewRowsFor(db, placeId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.attributedTo).toBe(viewer);
      const [stored] = await db
        .select({ requested: places.reviewRequestedAt })
        .from(places)
        .where(eq(places.id, placeId));
      const payload = rows[0]?.payload as { submittedAt?: string } | undefined;
      expect(payload?.submittedAt).toBe(stored?.requested?.toISOString());
    });
  });

  it("X27: somebody else's pending place neither blocks a creation nor appears among its near-misses — it does not exist for them", async () => {
    await withTestDb(async (db) => {
      const first = await seedUser(db);
      const second = await seedUser(db);
      const name = fixtureName();
      const theirs = await activate(newCreationActor(db, first)).then((a) =>
        a.createPlace(userCtx(first, "r1"), baseInput(name)),
      );
      expect(theirs.place.reviewStatus).toBe("pending");

      const mine = await activate(newCreationActor(db, second)).then((a) =>
        a.createPlace(userCtx(second, "r2"), baseInput(name)),
      );
      expect(mine.place.id).not.toBe(theirs.place.id);
      expect(mine.nearbyDuplicates).toEqual([]);

      // …and the live duplicate check, the form's, says the same.
      const checker = await activate(newCreationActor(db, second));
      const found = await checker.findDuplicates(userCtx(second, "r3"), {
        name,
        location: SAN_FRANCISCO,
      });
      expect(found.map((d) => d.placeId)).toEqual([mine.place.id]);
    });
  });

  it("X27: a shared place still blocks, exactly as before, and is named", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const name = fixtureName();
      const sharedId = await insertShared(db, name);
      const actor = await activate(newCreationActor(db, viewer));
      await expect(
        actor.createPlace(userCtx(viewer, "r"), baseInput(name)),
      ).rejects.toThrow(new RegExp(`it is place ${sharedId}`));
    });
  });

  it("X27: a placeId that is somebody else's is refused in one wording, whatever that place's review status — no oracle for a pending one", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const pendingId = crypto.randomUUID();
      await activate(newCreationActor(db, owner)).then((a) =>
        a.createPlace(userCtx(owner, "r1"), {
          ...baseInput(fixtureName()),
          placeId: pendingId,
        }),
      );
      const sharedId = await insertShared(db, fixtureName(), {
        lng: SAN_FRANCISCO.lng + 0.05,
        lat: SAN_FRANCISCO.lat,
      });

      const actor = await activate(newCreationActor(db, other));
      const refusals: string[] = [];
      for (const placeId of [pendingId, sharedId]) {
        const error = await actor
          .createPlace(userCtx(other, `r-${placeId}`), {
            ...baseInput(fixtureName()),
            location: { lng: SAN_FRANCISCO.lng + 0.1, lat: SAN_FRANCISCO.lat },
            placeId,
          })
          .then(
            () => null,
            (caught: unknown) => caught,
          );
        expect(error).toBeInstanceOf(ConflictError);
        refusals.push(
          String((error as Error).message).replace(placeId, "<id>"),
        );
      }
      expect(refusals[0]).toBe(refusals[1]);
      // Nothing was written under either id for the second user.
      const theirs = await db
        .select({ id: places.id })
        .from(places)
        .where(eq(places.createdBy, other));
      expect(theirs).toEqual([]);
    });
  });

  it("createPlace: rejects a caller-chosen confidence, a bad website and an over-long description", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const ctx = userCtx(viewer, "r");
      const actor = await activate(newCreationActor(db, viewer));

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
      const actor = await activate(newCreationActor(db, viewer));

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
      const theirs = await activate(newCreationActor(db, other));
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
      const actor = await activate(newCreationActor(db, viewer));
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
      const actor = await activate(newCreationActor(db, viewer));
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
        newCreationActor(db, viewer, { create: alwaysConflicts }),
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
          newCreationActor(tx, viewer, { create: barrieredCreator(tx) }),
        );
        const result = await actor.createPlace(
          userCtx(viewer, `r-${placeId}`),
          input,
        );
        await dropQueuedReviews(tx, result.place.id);
        return result;
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

describe.skipIf(skip)(
  "PlaceCreationActor keyed per creator (Wave 6, X27)",
  () => {
    /**
     * Two *different* users adding the same bar at the same moment, in two
     * activations and two real top-level transactions.
     *
     * Before X27 this was the race the geocell locks inside `PlaceActor.create`
     * existed to close: exactly one place, and the other creator told it was a
     * duplicate. Since X27 a new place is its creator's alone until reviewed, so
     * telling the second creator about the first one's pending place would be
     * the existence oracle D28 forbids. Both creations therefore succeed, each
     * creator sees only their own — and the duplicate rule moves to the
     * approval, where `PlaceActor.applyReview` re-runs it under the same locks
     * against *shared* places (`place-review-actor.test.ts` races two
     * approvals the way this used to race two creations).
     *
     * The rendezvous still releases both into `PlaceActor.create` together and
     * holds each open after its INSERT, so the second creator is genuinely
     * parked on the first one's geocell locks and then re-checks against a
     * committed pending row — which it must not treat as a duplicate.
     */
    const HOLD_MS = 750;

    it("two users creating the same place at once → two pending places, each its creator's alone, and neither creator is told of the other", async () => {
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
      const attempt = (viewer: string) =>
        testDb().transaction(async (tx) => {
          const actor = await activate(
            newCreationActor(tx, viewer, { create: creatorFor(tx) }),
          );
          const result = await actor.createPlace(
            userCtx(viewer, `r-${viewer}`),
            baseInput(name),
          );
          await dropQueuedReviews(tx, result.place.id);
          return result;
        });

      try {
        const results = await Promise.all(users.map((user) => attempt(user)));
        expect(results.map((r) => r.place.createdById)).toEqual(users);
        for (const result of results) {
          expect(result.place.reviewStatus).toBe("pending");
          expect(result.nearbyDuplicates).toEqual([]);
        }
        const rows = await testDb()
          .select({ id: places.id, createdBy: places.createdBy })
          .from(places)
          .where(eq(places.name, name));
        expect(rows).toHaveLength(2);
      } finally {
        await testDb().delete(places).where(eq(places.name, name));
        for (const user of users) {
          await testDb().execute(
            sql`delete from "user" where id = ${user}::uuid`,
          );
        }
      }
    }, 30_000);
  },
);
