/**
 * `PlaceActor` and a place under review (X27 / D28): concealment, and the
 * creator's controls — `editUnshared`, `deleteUnshared`, `acceptSuggestion`,
 * `dismissSuggestions`.
 *
 * D28's rule is "creator-only, with no existence oracle". The concealment
 * block is the oracle check in the house shape (`concealment.test.ts` names
 * the pattern): for each method a stranger can reach, a stranger's answer for
 * a real pending place and for an id that names nothing are the *same* error,
 * and the creator (and an admin) are served.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  files,
  menuScans,
  outbox,
  places,
  userPlaceInteractions,
} from "@cellar-assistant/db";
import { and, eq } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedTierList, seedTierListPlace } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { PlaceActor } from "./place-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

let seq = 0;
const fixtureName = (): string => {
  seq += 1;
  return `X27 Unshared ${Date.now().toString(36)}-${seq}`;
};

const placeActor = (db: DbOrTx, id: string) =>
  activate(new PlaceActor(daprClient(), new ActorId(id), db));

/** A user place, created the production way (pending, review queued). */
const createPlace = async (
  db: DbOrTx,
  creator: string,
  location = SAN_FRANCISCO,
): Promise<string> => {
  const id = crypto.randomUUID();
  await (await placeActor(db, id)).create(userCtx(creator, "r-create"), {
    name: fixtureName(),
    categories: ["wine_bar"],
    location,
    createdById: creator,
  });
  return id;
};

/** Force a review outcome directly — this file is not about the review. */
const setStatus = async (
  db: DbOrTx,
  id: string,
  patch: Partial<typeof places.$inferInsert>,
): Promise<void> => {
  await db.update(places).set(patch).where(eq(places.id, id));
};

const reviewRows = (db: DbOrTx, id: string) =>
  db
    .select({ id: outbox.id, payload: outbox.payload })
    .from(outbox)
    .where(
      and(eq(outbox.targetActor, "PlaceReviewActor"), eq(outbox.targetId, id)),
    );

/** The error a call ends in, or null. */
const failure = async (call: () => Promise<unknown>): Promise<unknown> =>
  call().then(
    () => null,
    (error: unknown) => error,
  );

const { skip } = await resolveTestDatabase();
afterAll(closeTestDb);

describe.skipIf(skip)("PlaceActor — places under review (X27)", () => {
  /* ---------------------------------------------------------------------- */
  /* Concealment                                                             */
  /* ---------------------------------------------------------------------- */

  const READS: readonly [
    string,
    (a: PlaceActor, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["get", (a, ctx) => a.get(ctx)],
    ["enrichment", (a, ctx) => a.enrichment(ctx)],
    ["photos", (a, ctx) => a.photos(ctx)],
    ["menus", (a, ctx) => a.menus(ctx)],
    ["brands", (a, ctx) => a.brands(ctx)],
    ["menuItems", (a, ctx) => a.menuItems(ctx, pageArgs({ first: 5 }))],
    ["recordAccess", (a, ctx) => a.recordAccess(ctx)],
    [
      "linkBrand",
      (a, ctx) =>
        a.linkBrand(ctx, {
          brandId: crypto.randomUUID(),
          relationshipType: "serves",
        }),
    ],
    ["enrichFromGoogle", (a, ctx) => a.enrichFromGoogle(ctx)],
    [
      "editUnshared",
      (a, ctx) =>
        a.editUnshared(ctx, {
          name: fixtureName(),
          categories: ["bar"],
          location: SAN_FRANCISCO,
        }),
    ],
    ["deleteUnshared", (a, ctx) => a.deleteUnshared(ctx)],
    [
      "acceptSuggestion",
      (a, ctx) => a.acceptSuggestion(ctx, { category: "bar" }),
    ],
    ["dismissSuggestions", (a, ctx) => a.dismissSuggestions(ctx)],
  ];

  for (const status of ["pending", "rejected"] as const) {
    it.each(READS)(
      `%s: a stranger, a friend-of-nobody and an anonymous caller get the same NotFound for a ${status} place as for an id that names nothing`,
      async (_name, call) => {
        await withTestDb(async (db) => {
          const creator = await seedUser(db);
          const stranger = await seedUser(db);
          const id = await createPlace(db, creator);
          await setStatus(db, id, { reviewStatus: status });
          const absent = crypto.randomUUID();

          for (const ctx of [
            userCtx(stranger, "r-stranger"),
            anonymousCtx("r-anon"),
          ]) {
            const real = await failure(async () =>
              call(await placeActor(db, id), ctx),
            );
            const none = await failure(async () =>
              call(await placeActor(db, absent), ctx),
            );
            expect(real).toBeInstanceOf(NotFoundError);
            expect(none).toBeInstanceOf(NotFoundError);
            expect(String((real as Error).message).replace(id, "<id>")).toBe(
              String((none as Error).message).replace(absent, "<id>"),
            );
          }
        });
      },
    );
  }

  it("the creator and an admin see a pending place; the creator sees its review fields", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const admin = await seedUser(db);
      const id = await createPlace(db, creator);
      const mine = await (await placeActor(db, id)).get(userCtx(creator, "r"));
      expect(mine.reviewStatus).toBe("pending");
      const repaired = await (await placeActor(db, id)).get(
        adminCtx(admin, "r-admin"),
      );
      expect(repaired.id).toBe(id);
    });
  });

  it("an approved place is catalog data again — and its suggestions stay the creator's", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const id = await createPlace(db, creator);
      await setStatus(db, id, {
        reviewStatus: "approved",
        suggestedCategories: ["cocktail_bar"],
        suggestedDescription: "A suggestion.",
      });
      const theirs = await (await placeActor(db, id)).get(
        userCtx(stranger, "r"),
      );
      expect(theirs.reviewStatus).toBe("approved");
      expect(theirs.suggestedCategories).toEqual([]);
      expect(theirs.suggestedDescription).toBeNull();
      const mine = await (await placeActor(db, id)).get(userCtx(creator, "r"));
      expect(mine.suggestedCategories).toEqual(["cocktail_bar"]);
    });
  });

  it("the creator's controls on an *approved* place: a stranger is told Forbidden, not NotFound — its existence is no secret", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const id = await createPlace(db, creator);
      await setStatus(db, id, { reviewStatus: "approved" });
      await expect(
        (await placeActor(db, id)).dismissSuggestions(userCtx(stranger, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* editUnshared                                                            */
  /* ---------------------------------------------------------------------- */

  it("edit: a rejected place goes back to pending, its verdict and suggestions cleared, with a fresh review queued", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const id = await createPlace(db, creator);
      await setStatus(db, id, {
        reviewStatus: "rejected",
        rejectionReason: "Couldn't confirm this is a venue.",
        suggestedCategories: ["bar"],
        suggestedDescription: "Old suggestion.",
        reviewedAt: new Date(),
        confidence: "0.20",
      });
      const before = await reviewRows(db, id);

      const name = fixtureName();
      const edited = await (await placeActor(db, id)).editUnshared(
        userCtx(creator, "r-edit"),
        {
          name,
          categories: ["cocktail_bar"],
          location: SAN_FRANCISCO,
          streetAddress: "1 Market St",
          website: "example.com",
        },
      );
      expect(edited).toMatchObject({
        name,
        categories: ["cocktail_bar"],
        streetAddress: "1 Market St",
        website: "https://example.com/",
        reviewStatus: "pending",
        rejectionReason: null,
        suggestedCategories: [],
        suggestedDescription: null,
        reviewedAt: null,
        confidence: 0.5,
      });

      const after = await reviewRows(db, id);
      expect(after).toHaveLength(before.length + 1);
      const [row] = await db
        .select({ requested: places.reviewRequestedAt })
        .from(places)
        .where(eq(places.id, id));
      expect(
        after.map((r) => (r.payload as { submittedAt: string }).submittedAt),
      ).toContain(row?.requested?.toISOString());
    });
  });

  it("edit: an approved place is shared and not editable here; the creator's input is validated like a creation's", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const ctx = userCtx(creator, "r");
      const id = await createPlace(db, creator);
      await expect(
        (await placeActor(db, id)).editUnshared(ctx, {
          name: "x",
          categories: ["bar"],
          location: SAN_FRANCISCO,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        (await placeActor(db, id)).editUnshared(ctx, {
          name: fixtureName(),
          categories: [],
          location: SAN_FRANCISCO,
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await setStatus(db, id, { reviewStatus: "approved" });
      await expect(
        (await placeActor(db, id)).editUnshared(ctx, {
          name: fixtureName(),
          categories: ["bar"],
          location: SAN_FRANCISCO,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("edit: moving onto one of the creator's own places is a duplicate; onto a stranger's pending place it is not", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const elsewhere = {
        lng: SAN_FRANCISCO.lng + 0.05,
        lat: SAN_FRANCISCO.lat,
      };
      const mine = await createPlace(db, creator, elsewhere);
      const [mineRow] = await db
        .select({ name: places.name })
        .from(places)
        .where(eq(places.id, mine));
      const theirs = await createPlace(db, stranger, SAN_FRANCISCO);
      const [theirRow] = await db
        .select({ name: places.name })
        .from(places)
        .where(eq(places.id, theirs));

      const moving = await createPlace(db, creator, {
        lng: SAN_FRANCISCO.lng + 0.1,
        lat: SAN_FRANCISCO.lat,
      });
      await expect(
        (await placeActor(db, moving)).editUnshared(userCtx(creator, "r1"), {
          name: mineRow?.name ?? "",
          categories: ["bar"],
          location: elsewhere,
        }),
      ).rejects.toThrow(new RegExp(`it is place ${mine}`));

      const edited = await (await placeActor(db, moving)).editUnshared(
        userCtx(creator, "r2"),
        {
          name: theirRow?.name ?? "",
          categories: ["bar"],
          location: SAN_FRANCISCO,
        },
      );
      expect(edited.reviewStatus).toBe("pending");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* deleteUnshared                                                          */
  /* ---------------------------------------------------------------------- */

  it("delete: the creator deletes their rejected place, and their own saved row goes with it", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const id = await createPlace(db, creator);
      await setStatus(db, id, { reviewStatus: "rejected" });
      await db
        .insert(userPlaceInteractions)
        .values({ userId: creator, placeId: id, wantToVisit: true });

      const actor = await placeActor(db, id);
      expect(await actor.deleteUnshared(userCtx(creator, "r"))).toEqual({
        placeId: id,
      });
      expect(await db.select().from(places).where(eq(places.id, id))).toEqual(
        [],
      );
      expect(
        await db
          .select()
          .from(userPlaceInteractions)
          .where(eq(userPlaceInteractions.placeId, id)),
      ).toEqual([]);
      // The activation forgets it too.
      await expect(actor.get(userCtx(creator, "r2"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it("delete: a shared place cannot be deleted; nor one a tier list or a menu scan still points at", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const ctx = userCtx(creator, "r");

      const shared = await createPlace(db, creator);
      await setStatus(db, shared, { reviewStatus: "approved" });
      await expect(
        (await placeActor(db, shared)).deleteUnshared(ctx),
      ).rejects.toBeInstanceOf(ConflictError);

      const listed = await createPlace(db, creator, {
        lng: SAN_FRANCISCO.lng + 0.05,
        lat: SAN_FRANCISCO.lat,
      });
      const tierListId = await seedTierList(db, {
        createdById: creator,
        privacy: "PRIVATE",
      });
      await seedTierListPlace(db, tierListId, listed);
      await expect(
        (await placeActor(db, listed)).deleteUnshared(ctx),
      ).rejects.toThrow(/tier lists/);

      const scanned = await createPlace(db, creator, {
        lng: SAN_FRANCISCO.lng + 0.1,
        lat: SAN_FRANCISCO.lat,
      });
      const fileId = crypto.randomUUID();
      await db.insert(files).values({
        id: fileId,
        bucket: "cellar-files",
        key: `menu-scan/${fileId}`,
        uploadedBy: creator,
      });
      await db.insert(menuScans).values({
        userId: creator,
        placeId: scanned,
        originalImageId: fileId,
      });
      await expect(
        (await placeActor(db, scanned)).deleteUnshared(ctx),
      ).rejects.toThrow(/menu scan/);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Suggestions                                                             */
  /* ---------------------------------------------------------------------- */

  it("accepting a suggested category adds it and uses it up; one that was not offered is refused", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const id = await createPlace(db, creator);
      await setStatus(db, id, {
        reviewStatus: "approved",
        suggestedCategories: ["cocktail_bar", "restaurant"],
      });
      const ctx = userCtx(creator, "r");

      const after = await (await placeActor(db, id)).acceptSuggestion(ctx, {
        category: "cocktail_bar",
      });
      expect(after.categories).toEqual(["wine_bar", "cocktail_bar"]);
      expect(after.suggestedCategories).toEqual(["restaurant"]);

      await expect(
        (await placeActor(db, id)).acceptSuggestion(ctx, {
          category: "brewery",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("accepting the suggested description fills an empty one — and never overwrites the creator's words", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const ctx = userCtx(creator, "r");
      const empty = await createPlace(db, creator);
      await setStatus(db, empty, {
        reviewStatus: "approved",
        suggestedDescription: "A snug natural-wine bar.",
      });
      const filled = await (await placeActor(db, empty)).acceptSuggestion(ctx, {
        description: true,
      });
      expect(filled.description).toBe("A snug natural-wine bar.");
      expect(filled.suggestedDescription).toBeNull();

      const own = await createPlace(db, creator, {
        lng: SAN_FRANCISCO.lng + 0.05,
        lat: SAN_FRANCISCO.lat,
      });
      await setStatus(db, own, {
        description: "Ours.",
        suggestedDescription: "Theirs.",
      });
      const kept = await (await placeActor(db, own)).acceptSuggestion(ctx, {
        description: true,
      });
      expect(kept.description).toBe("Ours.");

      await expect(
        (await placeActor(db, own)).acceptSuggestion(ctx, {
          description: true,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("dismissing clears every remaining suggestion, and is idempotent", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const id = await createPlace(db, creator);
      await setStatus(db, id, {
        suggestedCategories: ["bar"],
        suggestedDescription: "x",
      });
      const ctx = userCtx(creator, "r");
      for (const _ of [0, 1]) {
        const after = await (await placeActor(db, id)).dismissSuggestions(ctx);
        expect(after.suggestedCategories).toEqual([]);
        expect(after.suggestedDescription).toBeNull();
      }
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Creation                                                                */
  /* ---------------------------------------------------------------------- */

  it("create: a replay converges only on the same creator's row — anyone else's id is refused", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const other = await seedUser(db);
      const id = await createPlace(db, creator);
      const again = await (await placeActor(db, id)).create(
        userCtx(creator, "r"),
        {
          name: fixtureName(),
          categories: ["bar"],
          location: SAN_FRANCISCO,
          createdById: creator,
        },
      );
      expect(again.id).toBe(id);
      await expect(
        (await placeActor(db, id)).create(userCtx(other, "r"), {
          name: fixtureName(),
          categories: ["bar"],
          location: SAN_FRANCISCO,
          createdById: other,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("system-only methods check the caller before the row: a user is Forbidden whether or not the place exists", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const stranger = await seedUser(db);
      const id = await createPlace(db, creator);
      for (const target of [id, crypto.randomUUID()]) {
        await expect(
          (await placeActor(db, target)).refreshFromSource(
            userCtx(stranger, "r"),
          ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          (await placeActor(db, target)).applyReview(userCtx(stranger, "r"), {
            submittedAt: new Date().toISOString(),
            review: { approved: true, confidenceAdjustment: 0, flags: [] },
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      // The delivery itself is fine with a missing place.
      expect(
        await (await placeActor(db, crypto.randomUUID())).applyReview(
          systemCtx("outbox:x"),
          {
            submittedAt: new Date().toISOString(),
            review: { approved: true, confidenceAdjustment: 0, flags: [] },
          },
        ),
      ).toMatchObject({ status: "skipped", reason: "gone" });
    });
  });
});
