/**
 * `PlaceActor` against a real Postgres (B5, migration plan §2.1, §1.6, §8.5).
 *
 * `createActor` (`src/lib/testing.ts`) forwards three constructor arguments,
 * so — exactly as `file-actor.test.ts` does for `FileActor`'s storage binding
 * and `brand-registry-actor.test.ts` for its creator — `PlaceActor`'s three
 * extra seams (Google, budget, photo store) are supplied by `newPlaceActor`
 * below. The Google seam's *production* default throws
 * (`unconfiguredGooglePlacesClient`), which is asserted here too: no test in
 * this repo may reach the network, and a deployment that forgot to configure a
 * key must fail loudly rather than store empty enrichments.
 *
 * ## `places` is empty in this database
 *
 * A3's transform restores a schema-only dump, so there is no seed place to
 * borrow. Every fixture here is created by `seedPlace`, inside `withTestDb`'s
 * rolled-back transaction.
 */
import {
  adminCtx,
  anonymousCtx,
  BUDGET_ACTOR_ID,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  type ReserveInput,
  type ReserveResult,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  apiUsageLog,
  brands,
  files,
  menuItemRecipes,
  outbox,
  placeGoogleEnrichments,
  placeGooglePhotos,
  placeMenuItems,
  placeMenus,
  places,
} from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { BudgetReserver } from "../lib/budget-reservers.ts";
import type { DbOrTx } from "../lib/db.ts";
import type {
  GooglePlaceDetails,
  GooglePlacesClient,
} from "../lib/google-places.ts";
import {
  GOOGLE_PLACES_SERVICE,
  unconfiguredGooglePlacesClient,
} from "../lib/google-places.ts";
import { seedItemOfType, seedRecipe } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  deliveryCtx,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { BudgetActor } from "./budget-actor.ts";
import type { PlacePhotoStore } from "./place-actor.ts";
import { PlaceActor } from "./place-actor.ts";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** Allows everything and charges nothing — the default for tests about
 *  something other than the budget. */
const allowAll: BudgetReserver = async () => ({
  allowed: true,
  effectiveCostCents: 0,
  currentSpendCents: 0,
  limitCents: 0,
  requestCount: 0,
  freeTierLimit: 0,
  isEnabled: true,
  reason: "test",
  usageId: null,
});

const denyAll: BudgetReserver = async () => ({
  allowed: false,
  effectiveCostCents: 0,
  currentSpendCents: 500,
  limitCents: 100,
  requestCount: 9,
  freeTierLimit: 0,
  isEnabled: true,
  reason: "budget exceeded",
  usageId: null,
});

const noPhotoStore: PlacePhotoStore = async () => {
  throw new Error("no photo should have been stored in this test");
};

/** A Google client that answers with whatever the test set up. */
const fakeGoogle = (
  overrides: Partial<GooglePlacesClient> = {},
): GooglePlacesClient => ({
  textSearch: async () => null,
  details: async () => null,
  photo: async () => null,
  // C1 widened `GooglePlacesClient` with the two endpoints `GooglePlacesActor`
  // needs (§2.3). Nothing in B5 calls them.
  autocomplete: async () => null,
  nearbySearch: async () => null,
  ...overrides,
});

const details = (
  googlePlaceId: string,
  overrides: Partial<GooglePlaceDetails> = {},
): GooglePlaceDetails => ({
  googlePlaceId,
  name: "Google's name for it",
  formattedAddress: "1 Test Street",
  rating: 4.5,
  userRatingsTotal: 120,
  priceLevel: 2,
  website: "https://example.test",
  phone: "+1 555 0100",
  openingHours: { weekdayDescriptions: ["Mon: 9-5"] },
  types: ["restaurant", "bar"],
  businessStatus: "OPERATIONAL",
  editorialSummary: "A test venue.",
  photos: [],
  attributions: [],
  ...overrides,
});

const newPlaceActor = (
  placeId: string,
  db: DbOrTx,
  seams: {
    google?: GooglePlacesClient;
    reserve?: BudgetReserver;
    storePhoto?: PlacePhotoStore;
  } = {},
): PlaceActor =>
  new PlaceActor(
    daprClient(),
    new ActorId(placeId),
    db,
    seams.google ?? fakeGoogle(),
    seams.reserve ?? allowAll,
    seams.storePhoto ?? noPhotoStore,
  );

const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

const seedPlace = async (
  db: DbOrTx,
  overrides: {
    name?: string;
    createdById?: string | null;
    location?: { lng: number; lat: number };
    googlePlaceId?: string | null;
  } = {},
): Promise<string> => {
  const [row] = await db
    .insert(places)
    .values({
      name: overrides.name ?? "Test Wine Bar",
      categories: ["wine_bar"],
      location: overrides.location ?? SAN_FRANCISCO,
      createdBy: overrides.createdById ?? null,
      source: "user",
      ...(overrides.googlePlaceId === undefined
        ? {}
        : { googlePlaceId: overrides.googlePlaceId }),
    })
    .returning({ id: places.id });
  if (row === undefined) throw new Error("seedPlace: no row");
  return row.id;
};

/**
 * `place_menu_items.menu_scan_id` is a real FK, and `menu_scans` needs a
 * `public.files` row (B8's transform 12 repointed `original_image_id` off
 * `storage.files`, the way B5's transform 10 moved `place_google_photos`).
 */
const seedMenuScan = async (db: DbOrTx, userId: string): Promise<string> => {
  const [file] = await db
    .insert(files)
    .values({ key: `menus/${crypto.randomUUID()}.jpg`, verifiedAt: new Date() })
    .returning({ id: files.id });
  const fileId = file?.id;
  const scan = await db.execute<{ id: string }>(sql`
    insert into menu_scans (user_id, original_image_id, processing_status)
    values (${userId}::uuid, ${fileId}::uuid, 'completed') returning id
  `);
  const id = scan.rows[0]?.id;
  if (id === undefined) throw new Error("seedMenuScan: no row");
  return id;
};

/**
 * A `place_menu_items` row on the *other* side of
 * `check_menu_or_scan_source`: sourced from a `place_menus` row rather than a
 * scan. Written straight to the table because no actor method creates one —
 * that is precisely the point the test using it makes.
 */
const seedMenuSourcedItem = async (
  db: DbOrTx,
  placeId: string,
  createdBy: string,
): Promise<string> => {
  const [menu] = await db
    .insert(placeMenus)
    .values({ placeId, menuData: {}, source: "user_upload", createdBy })
    .returning({ id: placeMenus.id });
  const menuId = menu?.id;
  if (menuId === undefined) throw new Error("seedMenuSourcedItem: no menu");
  const [row] = await db
    .insert(placeMenuItems)
    .values({ placeId, placeMenuId: menuId, menuItemName: "House Red" })
    .returning({ id: placeMenuItems.id });
  if (row === undefined) throw new Error("seedMenuSourcedItem: no row");
  return row.id;
};

const seedBrand = async (db: DbOrTx, name: string): Promise<string> => {
  const [row] = await db.insert(brands).values({ name }).returning({
    id: brands.id,
  });
  if (row === undefined) throw new Error("seedBrand: no row");
  return row.id;
};

/** How many `menu_item_recipes` rows this menu item has — B8c writes exactly one. */
const menuItemRecipeCount = async (
  db: DbOrTx,
  menuItemId: string,
): Promise<number> => {
  const rows = await db
    .select({ id: menuItemRecipes.id })
    .from(menuItemRecipes)
    .where(eq(menuItemRecipes.menuItemId, menuItemId));
  return rows.length;
};

const MISSING = "00000000-0000-0000-0000-000000000000";

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("PlaceActor (B5)", () => {
  afterAll(closeTestDb);

  it("is tagged entity (§2.1)", () => {
    expect(PlaceActor.category).toBe("entity");
  });

  /* ---------------------------------------------------------------------- */
  /* Reads: owner / friend / stranger / anonymous                            */
  /* ---------------------------------------------------------------------- */

  it("get: owner, friend and stranger all see a place; anonymous is refused", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: owner });
      const actor = await activate(newPlaceActor(placeId, db));

      for (const viewer of [owner, friend, stranger]) {
        const place = await actor.get(userCtx(viewer, `r-${viewer}`));
        expect(place.id).toBe(placeId);
        expect(place.name).toBe("Test Wine Bar");
      }
      await expect(actor.get(anonymousCtx("r-anon"))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  it("get: a place that does not exist is NotFound", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(newPlaceActor(MISSING, db));
      await expect(actor.get(userCtx(viewer, "r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it("geography round-trips as { lng, lat } through create and get", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const placeId = crypto.randomUUID();
      const actor = await activate(newPlaceActor(placeId, db));

      const created = await actor.create(userCtx(creator, "r"), {
        name: "Point Reyes Oyster Bar",
        categories: ["restaurant"],
        location: { lng: -122.8, lat: 38.0668 },
        createdById: creator,
      });
      expect(created.location).toEqual({ lng: -122.8, lat: 38.0668 });

      // Re-read from Postgres through a *fresh* activation, so the value has
      // actually made the WKT-out / EWKB-in round trip.
      const reread = await activate(newPlaceActor(placeId, db));
      expect((await reread.get(userCtx(creator, "r2"))).location).toEqual({
        lng: -122.8,
        lat: 38.0668,
      });

      // And the column really is a geography, not text.
      const raw = await db.execute<{ srid: number; wkt: string }>(sql`
        select st_srid(location) as srid, st_astext(location) as wkt
        from places where id = ${placeId}::uuid
      `);
      expect(raw.rows[0]?.srid).toBe(4326);
      expect(raw.rows[0]?.wkt).toBe("POINT(-122.8 38.0668)");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* create                                                                  */
  /* ---------------------------------------------------------------------- */

  it("create: sets source=user and is_verified=false server-side, and leaves google_place_id null", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const placeId = crypto.randomUUID();
      const actor = await activate(newPlaceActor(placeId, db));

      const place = await actor.create(userCtx(creator, "r"), {
        name: "Bar Part Time",
        categories: ["wine_bar", "bar"],
        location: SAN_FRANCISCO,
        createdById: creator,
        // A client trying the old Hasura column list. `CreatePlaceInput` has
        // no such field, so this is dead weight at runtime and a type error
        // in any real caller — see the `google_place_id` test below.
        ...({ googlePlaceId: "ChIJ_ATTACKER" } as Record<string, unknown>),
      });

      expect(place.source).toBe("user");
      expect(place.isVerified).toBe(false);
      expect(place.googlePlaceId).toBeNull();
      expect(place.createdById).toBe(creator);
      expect(place.primaryCategory).toBe("wine_bar");
    });
  });

  it("create: user-supplied google_place_id can never reach the column", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const placeId = crypto.randomUUID();
      const actor = await activate(newPlaceActor(placeId, db));

      await actor.create(userCtx(creator, "r"), {
        name: "Injection Attempt",
        categories: ["bar"],
        location: SAN_FRANCISCO,
        createdById: creator,
        ...({
          googlePlaceId: "ChIJ_SOMEONE_ELSES",
          google_place_id: "ChIJ_SOMEONE_ELSES",
          source: "overture",
          isVerified: true,
        } as Record<string, unknown>),
      });

      const [row] = await db
        .select({
          googlePlaceId: places.googlePlaceId,
          source: places.source,
          isVerified: places.isVerified,
        })
        .from(places)
        .where(eq(places.id, placeId));
      expect(row?.googlePlaceId).toBeNull();
      expect(row?.source).toBe("user");
      expect(row?.isVerified).toBe(false);
    });
  });

  it("create: idempotent on the minted id, and refuses a creator that is not the caller", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const other = await seedUser(db);
      const placeId = crypto.randomUUID();
      const actor = await activate(newPlaceActor(placeId, db));
      const input = {
        name: "Idempotent Bar",
        categories: ["bar"],
        location: SAN_FRANCISCO,
        createdById: creator,
      };

      const first = await actor.create(userCtx(creator, "r1"), input);
      const second = await actor.create(userCtx(creator, "r2"), input);
      expect(second.id).toBe(first.id);

      const rows = await db
        .select({ id: places.id })
        .from(places)
        .where(eq(places.id, placeId));
      expect(rows).toHaveLength(1);

      const otherPlace = await activate(newPlaceActor(crypto.randomUUID(), db));
      await expect(
        otherPlace.create(userCtx(other, "r3"), input),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("create: rejects a bad name, no categories and an out-of-range location", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const base = {
        name: "Fine Name",
        categories: ["bar"],
        location: SAN_FRANCISCO,
        createdById: creator,
      };
      const ctx = userCtx(creator, "r");

      const a = await activate(newPlaceActor(crypto.randomUUID(), db));
      await expect(
        a.create(ctx, { ...base, name: "x" }),
      ).rejects.toBeInstanceOf(ValidationError);

      const b = await activate(newPlaceActor(crypto.randomUUID(), db));
      await expect(
        b.create(ctx, { ...base, categories: [] }),
      ).rejects.toBeInstanceOf(ValidationError);

      const c = await activate(newPlaceActor(crypto.randomUUID(), db));
      await expect(
        c.create(ctx, { ...base, location: { lng: 500, lat: 0 } }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* enrichFromGoogle                                                        */
  /* ---------------------------------------------------------------------- */

  it("enrichFromGoogle: a user ctx queues an outbox row and spends nothing", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: viewer });
      const actor = await activate(
        newPlaceActor(placeId, db, {
          // Any call to either seam would be a bug: a user turn must not
          // reach Google or the budget.
          google: unconfiguredGooglePlacesClient,
          reserve: async () => {
            throw new Error("a user turn must not reserve budget");
          },
        }),
      );

      const result = await actor.enrichFromGoogle(userCtx(viewer, "r"), {
        googlePlaceId: "ChIJ_USER_SUPPLIED",
      });
      expect(result.status).toBe("queued");

      const rows = await db
        .select()
        .from(outbox)
        .where(eq(outbox.targetId, placeId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.targetActor).toBe("PlaceActor");
      expect(rows[0]?.method).toBe("enrichFromGoogle");
      expect(rows[0]?.payload).toEqual({
        googlePlaceId: "ChIJ_USER_SUPPLIED",
        maxPhotos: 3,
      });
    });
  });

  it("enrichFromGoogle: the system turn writes the enrichment and binds google_place_id", async () => {
    await withTestDb(async (db) => {
      const placeId = await seedPlace(db);
      const actor = await activate(
        newPlaceActor(placeId, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_FOUND" }),
            details: async (id) => details(id),
          }),
        }),
      );

      const result = await actor.enrichFromGoogle(testDelivery("abc"));
      expect(result.status).toBe("enriched");
      expect(result.enrichment?.googlePlaceId).toBe("ChIJ_FOUND");
      expect(result.enrichment?.resolvedVia).toBe("text_search");
      expect(result.enrichment?.googleRating).toBe(4.5);

      const [place] = await db
        .select({ googlePlaceId: places.googlePlaceId })
        .from(places)
        .where(eq(places.id, placeId));
      expect(place?.googlePlaceId).toBe("ChIJ_FOUND");
    });
  });

  it("enrichFromGoogle: a second system turn inside the TTL is 'fresh' and calls Google no further", async () => {
    await withTestDb(async (db) => {
      const placeId = await seedPlace(db);
      let detailCalls = 0;
      const actor = await activate(
        newPlaceActor(placeId, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_FRESH" }),
            details: async (id) => {
              detailCalls += 1;
              return details(id);
            },
          }),
        }),
      );

      expect((await actor.enrichFromGoogle(testDelivery("1"))).status).toBe(
        "enriched",
      );
      expect((await actor.enrichFromGoogle(testDelivery("1"))).status).toBe(
        "fresh",
      );
      expect(detailCalls).toBe(1);
    });
  });

  /**
   * 32722feb's "Refresh from Google" queued an outbox row with no `force`, so
   * on a place enriched inside the window the system turn answered "fresh"
   * and wrote nothing, and the page polled three minutes for a
   * `detailsFetchedAt` that could not move before saying Google "has not
   * answered yet". The user half now answers what that turn would have.
   */
  it("enrichFromGoogle: a user ctx inside the TTL is told 'fresh' synchronously, with the fetch date, and queues nothing", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: viewer });
      const system = await activate(
        newPlaceActor(placeId, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_ALREADY" }),
            details: async (id) => details(id),
          }),
        }),
      );
      const enriched = await system.enrichFromGoogle(testDelivery("1"));
      expect(enriched.status).toBe("enriched");
      const fetchedAt = enriched.enrichment?.detailsFetchedAt;
      expect(fetchedAt).toEqual(expect.any(String));

      const user = await activate(
        newPlaceActor(placeId, db, {
          // Either seam being touched would mean a user click spent quota.
          google: unconfiguredGooglePlacesClient,
          reserve: async () => {
            throw new Error("a user turn must not reserve budget");
          },
        }),
      );
      const result = await user.enrichFromGoogle(userCtx(viewer, "r"), {
        // A hint does not buy a refresh inside the window: the queued turn
        // would have ignored it too.
        googlePlaceId: "ChIJ_SOMETHING_ELSE",
      });

      expect(result.status).toBe("fresh");
      expect(result.enrichment?.detailsFetchedAt).toBe(fetchedAt);
      expect(result.enrichment?.googlePlaceId).toBe("ChIJ_ALREADY");
      expect(result.reason).toContain(String(fetchedAt));
      const queued = await db
        .select()
        .from(outbox)
        .where(eq(outbox.targetId, placeId));
      expect(queued).toEqual([]);
    });
  });

  it("enrichFromGoogle: a user ctx past the TTL still queues", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: viewer });
      const system = await activate(
        newPlaceActor(placeId, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_STALE" }),
            details: async (id) => details(id),
          }),
        }),
      );
      expect((await system.enrichFromGoogle(testDelivery("1"))).status).toBe(
        "enriched",
      );
      await db
        .update(placeGoogleEnrichments)
        .set({
          detailsFetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        })
        .where(eq(placeGoogleEnrichments.placeId, placeId));

      const user = await activate(
        newPlaceActor(placeId, db, {
          google: unconfiguredGooglePlacesClient,
          reserve: async () => {
            throw new Error("a user turn must not reserve budget");
          },
        }),
      );
      const result = await user.enrichFromGoogle(userCtx(viewer, "r"));

      expect(result.status).toBe("queued");
      const queued = await db
        .select()
        .from(outbox)
        .where(eq(outbox.targetId, placeId));
      expect(queued).toHaveLength(1);
      expect(queued[0]?.method).toBe("enrichFromGoogle");
    });
  });

  it("enrichFromGoogle: a cross-row google_place_id collision is reported, not thrown, and writes nothing", async () => {
    await withTestDb(async (db) => {
      const incumbent = await seedPlace(db, {
        name: "The Original",
        googlePlaceId: "ChIJ_SHARED",
      });
      const duplicate = await seedPlace(db, { name: "The Duplicate" });

      const actor = await activate(
        newPlaceActor(duplicate, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_SHARED" }),
            details: async () => {
              throw new Error("details must not be fetched after a collision");
            },
          }),
        }),
      );

      const result = await actor.enrichFromGoogle(testDelivery("x"));
      expect(result.status).toBe("collision");
      expect(result.collision).toEqual({
        googlePlaceId: "ChIJ_SHARED",
        boundToPlaceId: incumbent,
      });

      // Nothing was written for the duplicate, and the incumbent still holds
      // the binding.
      const [dup] = await db
        .select({ googlePlaceId: places.googlePlaceId })
        .from(places)
        .where(eq(places.id, duplicate));
      expect(dup?.googlePlaceId).toBeNull();
      const enrichments = await db
        .select()
        .from(placeGoogleEnrichments)
        .where(eq(placeGoogleEnrichments.placeId, duplicate));
      expect(enrichments).toHaveLength(0);
    });
  });

  it("enrichFromGoogle: a collision against the enrichment table alone is caught too", async () => {
    await withTestDb(async (db) => {
      const incumbent = await seedPlace(db, { name: "Enriched Incumbent" });
      await db.insert(placeGoogleEnrichments).values({
        placeId: incumbent,
        googlePlaceId: "ChIJ_ENRICHED_ONLY",
        resolvedVia: "autocomplete",
      });
      const duplicate = await seedPlace(db, { name: "Latecomer" });

      const actor = await activate(
        newPlaceActor(duplicate, db, {
          google: fakeGoogle({ details: async (id) => details(id) }),
        }),
      );
      const result = await actor.enrichFromGoogle(testDelivery("y"), {
        googlePlaceId: "ChIJ_ENRICHED_ONLY",
      });
      expect(result.status).toBe("collision");
      expect(result.collision?.boundToPlaceId).toBe(incumbent);
    });
  });

  it("enrichFromGoogle: a budget denial stops before Google is called", async () => {
    await withTestDb(async (db) => {
      const placeId = await seedPlace(db);
      const actor = await activate(
        newPlaceActor(placeId, db, {
          reserve: denyAll,
          google: fakeGoogle({
            textSearch: async () => {
              throw new Error("no external call after a budget denial");
            },
          }),
        }),
      );
      const result = await actor.enrichFromGoogle(testDelivery("z"));
      expect(result.status).toBe("budget_denied");
      expect(result.reason).toContain("budget exceeded");
    });
  });

  it("enrichFromGoogle: photos are charged per photo and stored through the file seam", async () => {
    await withTestDb(async (db) => {
      const placeId = await seedPlace(db);
      const charged: string[] = [];
      const reserve: BudgetReserver = async (_ctx, input) => {
        charged.push(input.kind.endpoint);
        return (await allowAll(_ctx, input)) as ReserveResult;
      };
      const actor = await activate(
        newPlaceActor(placeId, db, {
          reserve,
          google: fakeGoogle({
            details: async (id) =>
              details(id, {
                photos: [
                  { name: "places/x/photos/a", widthPx: 800, heightPx: 600 },
                  { name: "places/x/photos/b" },
                ],
              }),
            photo: async () => ({
              bytes: new Uint8Array([1, 2, 3]),
              contentType: "image/jpeg",
            }),
          }),
          // What `FileActor.createUploadTarget` + `verify` leaves behind:
          // a real `files` row. `place_google_photos.storage_file_id` now
          // references it (B5's transform 10), so a fake id would fail the FK.
          storePhoto: async () => {
            const [file] = await db
              .insert(files)
              .values({ key: `place-photo/${crypto.randomUUID()}` })
              .returning({ id: files.id });
            if (file === undefined) throw new Error("no file row");
            return { fileId: file.id };
          },
        }),
      );

      const result = await actor.enrichFromGoogle(testDelivery("p"), {
        googlePlaceId: "ChIJ_WITH_PHOTOS",
        maxPhotos: 2,
      });
      expect(result.status).toBe("enriched");
      expect(result.photos).toHaveLength(2);
      expect(charged).toEqual(["place_details", "photo", "photo"]);

      const stored = await db
        .select()
        .from(placeGooglePhotos)
        .where(eq(placeGooglePhotos.placeId, placeId));
      expect(stored).toHaveLength(2);
      expect(stored.every((row) => row.storageFileId !== null)).toBe(true);
    });
  });

  it("enrichFromGoogle: the production Google client throws rather than faking success", async () => {
    await expect(
      unconfiguredGooglePlacesClient.details("ChIJ_ANY"),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      unconfiguredGooglePlacesClient.details("ChIJ_ANY"),
    ).rejects.toThrow(/GOOGLE_PLACES_API_KEY/);
  });

  it("refreshFromSource: system only, forces past the TTL, and stamps last_sync_at", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db);
      let detailCalls = 0;
      const actor = await activate(
        newPlaceActor(placeId, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_REFRESH" }),
            details: async (id) => {
              detailCalls += 1;
              return details(id);
            },
          }),
        }),
      );

      await expect(
        actor.refreshFromSource(userCtx(viewer, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect((await actor.enrichFromGoogle(testDelivery("1"))).status).toBe(
        "enriched",
      );
      expect((await actor.refreshFromSource(testDelivery("2"))).status).toBe(
        "enriched",
      );
      expect(detailCalls).toBe(2);

      const [place] = await db
        .select({ lastSyncAt: places.lastSyncAt })
        .from(places)
        .where(eq(places.id, placeId));
      expect(place?.lastSyncAt).not.toBeNull();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Menus                                                                   */
  /* ---------------------------------------------------------------------- */

  it("addMenuFromScan: system only, and idempotent on the scan id", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db);
      const menuScanId = await seedMenuScan(db, viewer);
      const actor = await activate(newPlaceActor(placeId, db));
      const input = {
        menuScanId,
        items: [
          { name: "Chablis", price: 14, detectedItemType: "wine" as const },
          { name: "Pilsner", price: 8, detectedItemType: "beer" as const },
        ],
      };

      await expect(
        actor.addMenuFromScan(userCtx(viewer, "r"), input),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const first = await actor.addMenuFromScan(testDelivery("1"), input);
      expect(first).toMatchObject({ created: 2, alreadyApplied: false });

      // A redelivery — a *different* outbox row id, the same scan.
      const second = await actor.addMenuFromScan(testDelivery("2"), input);
      expect(second).toMatchObject({ created: 0, alreadyApplied: true });

      const rows = await db
        .select()
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      expect(rows).toHaveLength(2);
    });
  });

  it("addMenuFromScan: stores searchName in the search_name column (trimmed; blank is none)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db);
      const menuScanId = await seedMenuScan(db, viewer);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [
          {
            name: "Ch. Margaux '15",
            detectedItemType: "wine" as const,
            searchName: " Chateau Margaux 2015 ",
          },
          {
            name: "Pilsner",
            detectedItemType: "beer" as const,
            searchName: " ",
          },
          { name: "Stout", detectedItemType: "beer" as const },
        ],
      });
      const rows = await db
        .select({
          name: placeMenuItems.menuItemName,
          searchName: placeMenuItems.searchName,
        })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      expect(rows.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: "Ch. Margaux '15", searchName: "Chateau Margaux 2015" },
        { name: "Pilsner", searchName: null },
        { name: "Stout", searchName: null },
      ]);
    });
  });

  it("menuItems: paged, and readable by owner, friend and stranger alike", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: owner });
      const menuScanId = await seedMenuScan(db, owner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: Array.from({ length: 5 }, (_, index) => ({
          name: `Item ${index}`,
        })),
      });

      const first = await actor.menuItems(
        userCtx(owner, "r"),
        pageArgs({ first: 2 }),
      );
      expect(first.entries).toHaveLength(2);
      expect(first.hasNextPage).toBe(true);
      expect(first.totalCount).toBe(5);

      const next = await actor.menuItems(
        userCtx(stranger, "r2"),
        pageArgs({ first: 2, after: first.entries[1]?.cursor }),
      );
      expect(next.entries.map((entry) => entry.node.id)).not.toEqual(
        first.entries.map((entry) => entry.node.id),
      );

      await expect(
        actor.menuItems(anonymousCtx("r3"), pageArgs({ first: 2 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("verifyMenuItemMatch: the scan owner may verify; anonymous may not; a missing item id is NotFound", async () => {
    await withTestDb(async (db) => {
      const scanOwner = await seedUser(db);
      const placeCreator = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: placeCreator });
      const menuScanId = await seedMenuScan(db, scanOwner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "Ambiguous Red", detectedItemType: "wine" as const }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      const menuItemId = item?.id ?? "";

      const verified = await actor.verifyMenuItemMatch(
        userCtx(scanOwner, "r-owner"),
        { menuItemId, match: null },
      );
      expect(verified.matchedItem).toBeNull();
      expect(verified.matchVerifiedById).toBe(scanOwner);

      await expect(
        actor.verifyMenuItemMatch(anonymousCtx("r"), {
          menuItemId,
          match: null,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      await expect(
        actor.verifyMenuItemMatch(userCtx(scanOwner, "r"), {
          menuItemId: MISSING,
          match: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      // A match naming an item that does not exist is NotFound, not a 500.
      await expect(
        actor.verifyMenuItemMatch(userCtx(scanOwner, "r"), {
          menuItemId,
          match: { type: "wine", id: MISSING },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  /**
   * The gap E5b found, in the shape it was measured in: a signed-in stranger
   * calling the `verifyMenuItemMatch` mutation directly wrote the four match
   * FK columns plus `match_verified_by` / `match_verified_at` on a menu line
   * produced by somebody else's scan.
   *
   * The place's own creator is in the loop deliberately. They are the most
   * plausible "surely *they* may" candidate, and they may not: the row belongs
   * to a scan, and `places.created_by` is not that scan's owner. A gate keyed
   * on the place instead of the scan would pass this user and fail the test.
   */
  it("verifyMenuItemMatch: a stranger and the place's own creator are both refused, and nothing is written", async () => {
    await withTestDb(async (db) => {
      const scanOwner = await seedUser(db);
      const placeCreator = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: placeCreator });
      const menuScanId = await seedMenuScan(db, scanOwner);
      const { id: wineId } = await seedItemOfType(db, "WINE", scanOwner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "Ambiguous Red", detectedItemType: "wine" as const }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      const menuItemId = item?.id ?? "";

      for (const viewer of [stranger, placeCreator]) {
        await expect(
          actor.verifyMenuItemMatch(userCtx(viewer, `r-${viewer}`), {
            menuItemId,
            match: { type: "wine", id: wineId },
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);

        // A rejection is a write too — `match: null` still stamps the
        // verifier, so it has to be refused on the same terms.
        await expect(
          actor.verifyMenuItemMatch(userCtx(viewer, `r2-${viewer}`), {
            menuItemId,
            match: null,
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }

      // Refused *before* the write, not after: the row is untouched.
      const [after] = await db
        .select({
          wineId: placeMenuItems.wineId,
          verifiedBy: placeMenuItems.matchVerifiedBy,
          verifiedAt: placeMenuItems.matchVerifiedAt,
        })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.id, menuItemId));
      expect(after?.wineId).toBeNull();
      expect(after?.verifiedBy).toBeNull();
      expect(after?.verifiedAt).toBeNull();
    });
  });

  /**
   * The `system` delivery must still pass, or accepting a suggestion breaks:
   * `MenuScanActor.actOnSuggestion` authorized the outbox row before writing
   * it (owner check, plus a join pinning the menu item to that scan), so this
   * turn is the delivered consequence rather than a second decision. That is
   * the one place where this gate's reasoning parts company with
   * `ItemOnboardingActor.#requireCellarWriteAccess`, which has no
   * `bypassesPolicy` branch on purpose.
   */
  it("verifyMenuItemMatch: the outbox delivery and an admin still pass", async () => {
    await withTestDb(async (db) => {
      const scanOwner = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: scanOwner });
      const menuScanId = await seedMenuScan(db, scanOwner);
      const { id: wineId } = await seedItemOfType(db, "WINE", scanOwner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "Ambiguous Red", detectedItemType: "wine" as const }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      const menuItemId = item?.id ?? "";

      const delivered = await actor.verifyMenuItemMatch(testDelivery("2"), {
        menuItemId,
        match: { type: "wine", id: wineId },
      });
      expect(delivered.matchedItem).toMatchObject({ type: "wine", id: wineId });

      const admin = await seedUser(db);
      const cleared = await actor.verifyMenuItemMatch(adminCtx(admin, "r"), {
        menuItemId,
        match: null,
      });
      expect(cleared.matchedItem).toBeNull();
    });
  });

  it("verifyMenuItemMatch: a sake or a tea match lands in its own column", async () => {
    await withTestDb(async (db) => {
      const scanOwner = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: scanOwner });
      const menuScanId = await seedMenuScan(db, scanOwner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "Junmai", detectedItemType: "sake" as const }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      const menuItemId = item?.id ?? "";

      for (const type of ["SAKE", "TEA"] as const) {
        const { id } = await seedItemOfType(db, type, scanOwner);
        const match = { type: type.toLowerCase() as "sake" | "tea", id };
        const verified = await actor.verifyMenuItemMatch(
          testDelivery(`v-${type}`),
          { menuItemId, match },
        );
        expect(verified.matchedItem).toEqual(match);
        const [row] = await db
          .select({
            sakeId: placeMenuItems.sakeId,
            teaId: placeMenuItems.teaId,
            wineId: placeMenuItems.wineId,
          })
          .from(placeMenuItems)
          .where(eq(placeMenuItems.id, menuItemId));
        // Exactly the one column — re-matching clears the previous type's.
        expect(row).toEqual({
          sakeId: type === "SAKE" ? id : null,
          teaId: type === "TEA" ? id : null,
          wineId: null,
        });
      }
    });
  });

  /**
   * `check_menu_or_scan_source` allows a second source — a `place_menus` row —
   * and that branch has no owner to appeal to: `place_menus.created_by` is
   * nullable and nothing in this codebase writes the table. So the honest
   * answer for such a row is `system`/`admin` only, and this asserts it rather
   * than leaving the branch untested because it is unreachable today.
   */
  it("verifyMenuItemMatch: a menu-sourced row has no user verifier at all", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: user });
      const menuItemId = await seedMenuSourcedItem(db, placeId, user);
      const actor = await activate(newPlaceActor(placeId, db));

      await expect(
        actor.verifyMenuItemMatch(userCtx(user, "r"), {
          menuItemId,
          match: null,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      // …and refused *for the stated reason*. Deleting the `menuScanId ===
      // null` branch entirely leaves this test green on the class alone: the
      // fall-through looks up `menu_scans` by a null id, finds nothing, and
      // refuses as "not the scan owner". Same outcome today, different claim —
      // and the difference stops being cosmetic the moment something writes
      // `place_menus`, because that is when "this row has no owner" becomes
      // false and the branch has to be revisited rather than silently kept.
      await expect(
        actor.verifyMenuItemMatch(userCtx(user, "r"), {
          menuItemId,
          match: null,
        }),
      ).rejects.toThrow(/no owner who may verify/);

      const verified = await actor.verifyMenuItemMatch(testDelivery("1"), {
        menuItemId,
        match: null,
      });
      expect(verified.id).toBe(menuItemId);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* linkMenuItemRecipe (B8c)                                                */
  /* ---------------------------------------------------------------------- */

  it("linkMenuItemRecipe: system writes exactly one row, and a second call is a no-op (§8.4)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: owner });
      const menuScanId = await seedMenuScan(db, owner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "House Negroni", detectedItemType: "cocktail" }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      const menuItemId = item?.id ?? "";
      const recipeId = await seedRecipe(db, { name: "Negroni" });

      const first = await actor.linkMenuItemRecipe(testDelivery("2"), {
        menuItemId,
        recipeId,
      });
      expect(first.created).toBe(true);
      expect(first.link.menuItemId).toBe(menuItemId);
      expect(first.link.recipeId).toBe(recipeId);
      expect(await menuItemRecipeCount(db, menuItemId)).toBe(1);

      // A redelivered outbox row conflicts on
      // `menu_item_recipes_menu_item_id_recipe_id_key` and writes nothing.
      const again = await actor.linkMenuItemRecipe(testDelivery("2"), {
        menuItemId,
        recipeId,
      });
      expect(again.created).toBe(false);
      expect(again.link.id).toBe(first.link.id);
      expect(await menuItemRecipeCount(db, menuItemId)).toBe(1);
    });
  });

  it("linkMenuItemRecipe: authorization runs before the write — a user, a stranger and anonymous are all refused and nothing lands", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: owner });
      const menuScanId = await seedMenuScan(db, owner);
      const actor = await activate(newPlaceActor(placeId, db));
      await actor.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "House Negroni", detectedItemType: "cocktail" }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, placeId));
      const menuItemId = item?.id ?? "";
      const recipeId = await seedRecipe(db, { name: "Negroni" });

      // Unlike `verifyMenuItemMatch`, this is not a signed-in-user surface:
      // the acceptance was authorized once, by `MenuScanActor`. Even the
      // place's own creator may not staple a recipe to a menu item directly.
      for (const ctx of [
        anonymousCtx("r1"),
        userCtx(stranger, "r2"),
        userCtx(owner, "r3"),
      ]) {
        await expect(
          actor.linkMenuItemRecipe(ctx, { menuItemId, recipeId }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect(await menuItemRecipeCount(db, menuItemId)).toBe(0);
    });
  });

  it("linkMenuItemRecipe: a menu item on another place, and a recipe that does not exist, are both NotFound", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: owner });
      const otherPlaceId = await seedPlace(db, { createdById: owner });
      const menuScanId = await seedMenuScan(db, owner);
      const other = await activate(newPlaceActor(otherPlaceId, db));
      await other.addMenuFromScan(testDelivery("1"), {
        menuScanId,
        items: [{ name: "Their Negroni", detectedItemType: "cocktail" }],
      });
      const [item] = await db
        .select({ id: placeMenuItems.id })
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, otherPlaceId));
      const foreignMenuItemId = item?.id ?? "";
      const recipeId = await seedRecipe(db, { name: "Negroni" });

      const actor = await activate(newPlaceActor(placeId, db));
      // `menu_item_recipes` carries no `place_id`, so this activation's key is
      // the only thing keeping `PlaceActor` the single writer of its own rows.
      await expect(
        actor.linkMenuItemRecipe(testDelivery("2"), {
          menuItemId: foreignMenuItemId,
          recipeId,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await menuItemRecipeCount(db, foreignMenuItemId)).toBe(0);

      await other.addMenuFromScan(testDelivery("3"), {
        menuScanId,
        items: [{ name: "Their Negroni", detectedItemType: "cocktail" }],
      });
      // A recipe id that does not exist is a caller mistake, not a 500.
      await expect(
        other.linkMenuItemRecipe(testDelivery("4"), {
          menuItemId: foreignMenuItemId,
          recipeId: MISSING,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Brands and access                                                       */
  /* ---------------------------------------------------------------------- */

  it("linkBrand: idempotent on (place, brand), and a missing brand is NotFound", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const placeId = await seedPlace(db);
      const brandId = await seedBrand(db, `B5 Test Brand ${Date.now()}`);
      const actor = await activate(newPlaceActor(placeId, db));

      const first = await actor.linkBrand(userCtx(viewer, "r"), {
        brandId,
        relationshipType: "serves",
      });
      const second = await actor.linkBrand(userCtx(viewer, "r2"), {
        brandId,
        relationshipType: "affiliated_with",
      });
      expect(second.id).toBe(first.id);
      expect(second.relationshipType).toBe("affiliated_with");
      expect(await actor.brands(userCtx(viewer, "r3"))).toHaveLength(1);

      await expect(
        actor.linkBrand(userCtx(viewer, "r4"), {
          brandId: MISSING,
          relationshipType: "serves",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.linkBrand(anonymousCtx("r5"), {
          brandId,
          relationshipType: "serves",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("recordAccess: bumps the place's own counters for any signed-in viewer", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { createdById: owner });
      const actor = await activate(newPlaceActor(placeId, db));

      expect((await actor.recordAccess(userCtx(owner, "r"))).accessCount).toBe(
        1,
      );
      const second = await actor.recordAccess(userCtx(stranger, "r2"));
      expect(second.accessCount).toBe(2);
      expect(second.lastAccessedAt).not.toBe("");

      await expect(
        actor.recordAccess(anonymousCtx("r3")),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("an admin may drive the system-only methods (the manual repair path)", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const placeId = await seedPlace(db);
      const actor = await activate(
        newPlaceActor(placeId, db, {
          google: fakeGoogle({
            textSearch: async () => ({ googlePlaceId: "ChIJ_ADMIN" }),
            details: async (id) => details(id),
          }),
        }),
      );
      const result = await actor.enrichFromGoogle(adminCtx(admin, "r"));
      expect(result.status).toBe("enriched");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The budget wiring: one usage row per paid Google call                       */
/* -------------------------------------------------------------------------- */

/**
 * The real `BudgetActor`, in-process on the same transaction, behind a
 * reserver that records what `PlaceActor` asked it for.
 *
 * `allowAll` above tests `PlaceActor`'s *logic* and not its *wiring*: it
 * answers "allowed" whatever key it is handed, so a key that collapsed every
 * call of a delivery onto one usage row looked exactly like one that did not
 * — which is how photos 2..n went unrecorded with every test green. What is
 * asserted below is the ledger itself: `api_usage_log` rows against the
 * paid calls the fake Google actually received.
 */
const budgetBackedReserver = async (
  db: DbOrTx,
): Promise<{ reserve: BudgetReserver; asked: ReserveInput[] }> => {
  const budget = await activate(createActor(BudgetActor, BUDGET_ACTOR_ID, db));
  const operator = adminCtx(crypto.randomUUID(), "budget-setup");
  for (const endpoint of ["text_search", "place_details", "photo"] as const) {
    await budget.setBudget(operator, {
      kind: { service: GOOGLE_PLACES_SERVICE, endpoint },
      monthlyBudgetCents: 1_000_000,
      freeTierMonthlyRequests: 0,
      isEnabled: true,
    });
  }
  const asked: ReserveInput[] = [];
  const reserve: BudgetReserver = async (ctx, input) => {
    asked.push(input);
    return budget.reserve(ctx, input);
  };
  return { reserve, asked };
};

/** A Google that counts every paid call it answers — the ground truth. */
const countingGoogle = (
  photoCount: number,
  overrides: { failFirstDetails?: boolean } = {},
) => {
  const calls = { textSearch: 0, details: 0, photo: 0 };
  let failDetails = overrides.failFirstDetails === true;
  const google = fakeGoogle({
    textSearch: async () => {
      calls.textSearch += 1;
      return { googlePlaceId: `ChIJ_${crypto.randomUUID()}` };
    },
    details: async (id) => {
      calls.details += 1;
      if (failDetails) {
        failDetails = false;
        // After the reservation, and after Google may well have billed it.
        throw new Error("socket hang up reading the details response");
      }
      return details(id, {
        photos: Array.from({ length: photoCount }, (_, i) => ({
          name: `places/${id}/photos/p${i}`,
        })),
      });
    },
    photo: async () => {
      calls.photo += 1;
      return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" };
    },
  });
  return {
    google,
    calls,
    paid: () => calls.textSearch + calls.details + calls.photo,
  };
};

/** A photo store that leaves the `files` row the FK needs (see above). */
const filesPhotoStore =
  (db: DbOrTx): PlacePhotoStore =>
  async () => {
    const [file] = await db
      .insert(files)
      .values({ key: `place-photo/${crypto.randomUUID()}` })
      .returning({ id: files.id });
    if (file === undefined) throw new Error("no file row");
    return { fileId: file.id };
  };

const usageRows = async (db: DbOrTx, placeId: string) =>
  (
    await db
      .select({
        endpoint: apiUsageLog.endpoint,
        metadata: apiUsageLog.metadata,
      })
      .from(apiUsageLog)
      .where(eq(apiUsageLog.entityId, placeId))
  ).map((row) => ({
    endpoint: row.endpoint,
    ...(row.metadata as { reservationId?: string; outboxRowId?: string }),
  }));

describe.skipIf(skip)(
  "PlaceActor → BudgetActor: one reservation per paid call",
  () => {
    afterAll(closeTestDb);

    it("one delivery fetching three photos records three photo rows, not one", async () => {
      await withTestDb(async (db) => {
        const placeId = await seedPlace(db);
        const { reserve, asked } = await budgetBackedReserver(db);
        const { google, calls, paid } = countingGoogle(3);
        const actor = await activate(
          newPlaceActor(placeId, db, {
            google,
            reserve,
            storePhoto: filesPhotoStore(db),
          }),
        );
        const rowId = crypto.randomUUID();

        const result = await actor.enrichFromGoogle(deliveryCtx(rowId), {
          googlePlaceId: "ChIJ_THREE_PHOTOS",
          maxPhotos: 3,
        });

        expect(result.status).toBe("enriched");
        expect(result.photos).toHaveLength(3);
        expect(calls.photo).toBe(3);

        const rows = await usageRows(db, placeId);
        expect(rows.map((row) => row.endpoint).sort()).toEqual([
          "photo",
          "photo",
          "photo",
          "place_details",
        ]);
        // Every paid call has exactly one row, and every row its own key.
        expect(rows).toHaveLength(paid());
        expect(new Set(rows.map((row) => row.reservationId)).size).toBe(4);
        expect(new Set(asked.map((input) => input.reservationId)).size).toBe(
          asked.length,
        );
        // The delivery is recorded as attribution, not used as the key.
        expect(rows.every((row) => row.outboxRowId === rowId)).toBe(true);
        expect(rows.some((row) => row.reservationId === rowId)).toBe(false);
      });
    });

    it("a redelivery that calls Google again is charged again; one that does not is not charged at all", async () => {
      await withTestDb(async (db) => {
        const placeId = await seedPlace(db);
        const { reserve } = await budgetBackedReserver(db);
        const { google, calls, paid } = countingGoogle(2, {
          failFirstDetails: true,
        });
        const actor = await activate(
          newPlaceActor(placeId, db, {
            google,
            reserve,
            storePhoto: filesPhotoStore(db),
          }),
        );
        const delivery = deliveryCtx(crypto.randomUUID());

        // Attempt 1 reserves, reaches Google, and dies reading the answer — so
        // the outbox will deliver the same row again.
        await expect(
          actor.enrichFromGoogle(delivery, {
            googlePlaceId: "ChIJ_RETRIED",
            maxPhotos: 2,
          }),
        ).rejects.toThrow(/socket hang up/);
        expect(calls.details).toBe(1);

        // Attempt 2, same delivery: the details were never stored, so Google is
        // asked again. Two calls, two rows — keyed on the delivery it was one.
        const retried = await actor.enrichFromGoogle(delivery, {
          googlePlaceId: "ChIJ_RETRIED",
          maxPhotos: 2,
        });
        expect(retried.status).toBe("enriched");
        expect(calls.details).toBe(2);

        // Attempt 3, same delivery again (the ack was lost): the details are
        // fresh, so nothing is asked of Google and nothing is reserved.
        const redelivered = await actor.enrichFromGoogle(delivery, {
          googlePlaceId: "ChIJ_RETRIED",
          maxPhotos: 2,
        });
        expect(redelivered.status).toBe("fresh");

        const rows = await usageRows(db, placeId);
        expect(paid()).toBe(4); // details ×2, photo ×2
        expect(rows).toHaveLength(paid());
        expect(
          rows.filter((row) => row.endpoint === "place_details"),
        ).toHaveLength(2);
      });
    });
  },
);

/* -------------------------------------------------------------------------- */
/* A photo loop that dies is finished by the redelivery                        */
/* -------------------------------------------------------------------------- */

/** Every photo name the fake Google was asked to download, in order. */
const recordingDownloads = (google: GooglePlacesClient) => {
  const downloads: string[] = [];
  return {
    downloads,
    google: {
      ...google,
      photo: async (name: string) => {
        downloads.push(name);
        return google.photo(name);
      },
    } satisfies GooglePlacesClient,
  };
};

const storedPhotoNames = async (db: DbOrTx, placeId: string) =>
  (
    await db
      .select({ name: placeGooglePhotos.googlePhotoName })
      .from(placeGooglePhotos)
      .where(eq(placeGooglePhotos.placeId, placeId))
  )
    .map((row) => row.name)
    .sort();

describe.skipIf(skip)(
  "PlaceActor: a photo loop that dies is finished by the redelivery",
  () => {
    afterAll(closeTestDb);

    it("the redelivery downloads only the missing photos, without asking for details again", async () => {
      await withTestDb(async (db) => {
        const placeId = await seedPlace(db);
        const { reserve } = await budgetBackedReserver(db);
        const counting = countingGoogle(3);
        const { google, downloads } = recordingDownloads(counting.google);
        // The second photo's BudgetActor hop times out: past the per-photo
        // catch, so the turn throws after one photo is stored — the shape of a
        // process dying mid-loop, with the details already committed.
        let photoReservations = 0;
        const dying: BudgetReserver = async (ctx, input) => {
          if (input.kind.endpoint === "photo") {
            photoReservations += 1;
            if (photoReservations === 2) {
              throw new Error("BudgetActor.reserve timed out after 15000ms");
            }
          }
          return reserve(ctx, input);
        };
        const seams = { google, storePhoto: filesPhotoStore(db) };
        const delivery = deliveryCtx(crypto.randomUUID());
        const payload = { googlePlaceId: "ChIJ_DIED_MID_PHOTOS", maxPhotos: 3 };

        await expect(
          (
            await activate(
              newPlaceActor(placeId, db, { ...seams, reserve: dying }),
            )
          ).enrichFromGoogle(delivery, payload),
        ).rejects.toThrow(/timed out/);
        expect(counting.calls.details).toBe(1);
        expect(downloads).toHaveLength(1);
        expect(await storedPhotoNames(db, placeId)).toHaveLength(1);

        // The outbox redelivers the same row, to a new activation.
        const redelivery = await activate(
          newPlaceActor(placeId, db, { ...seams, reserve }),
        );
        const resumed = await redelivery.enrichFromGoogle(delivery, payload);

        expect(resumed.status).toBe("fresh");
        expect(resumed.photos).toHaveLength(3);
        // Details were not asked for again, and no photo twice.
        expect(counting.calls.details).toBe(1);
        expect([...downloads].sort()).toEqual([
          "places/ChIJ_DIED_MID_PHOTOS/photos/p0",
          "places/ChIJ_DIED_MID_PHOTOS/photos/p1",
          "places/ChIJ_DIED_MID_PHOTOS/photos/p2",
        ]);
        expect(await storedPhotoNames(db, placeId)).toEqual([
          "places/ChIJ_DIED_MID_PHOTOS/photos/p0",
          "places/ChIJ_DIED_MID_PHOTOS/photos/p1",
          "places/ChIJ_DIED_MID_PHOTOS/photos/p2",
        ]);

        // And the loop is now finished: one more redelivery does nothing.
        const again = await redelivery.enrichFromGoogle(delivery, payload);
        expect(again.status).toBe("fresh");
        expect(downloads).toHaveLength(3);

        // Every paid call has exactly one row, each with its own key.
        const rows = await usageRows(db, placeId);
        expect(counting.paid()).toBe(4); // details ×1, photo ×3
        expect(rows).toHaveLength(counting.paid());
        expect(new Set(rows.map((row) => row.reservationId)).size).toBe(4);
      });
    });

    it("a loop that finished is finished, even when one of its photos failed", async () => {
      await withTestDb(async (db) => {
        const placeId = await seedPlace(db);
        const { reserve } = await budgetBackedReserver(db);
        const counting = countingGoogle(3);
        // Google answers nothing for p1, every time: a photo that will never
        // download, which a resume must not keep buying.
        const google: GooglePlacesClient = {
          ...counting.google,
          photo: async (name) => {
            const answer = await counting.google.photo(name);
            return name.endsWith("/p1") ? null : answer;
          },
        };
        const actor = await activate(
          newPlaceActor(placeId, db, {
            google,
            reserve,
            storePhoto: filesPhotoStore(db),
          }),
        );
        const delivery = deliveryCtx(crypto.randomUUID());
        const payload = { googlePlaceId: "ChIJ_ONE_BROKEN", maxPhotos: 3 };

        const first = await actor.enrichFromGoogle(delivery, payload);
        expect(first.status).toBe("enriched");
        expect(first.photos).toHaveLength(2);
        expect(counting.calls.photo).toBe(3);

        const redelivered = await actor.enrichFromGoogle(delivery, payload);
        expect(redelivered.status).toBe("fresh");
        expect(counting.calls.photo).toBe(3);
        expect(await usageRows(db, placeId)).toHaveLength(counting.paid());
      });
    });

    it("an admin repair without force resumes the photos too; the user half still answers fresh and queues nothing", async () => {
      await withTestDb(async (db) => {
        const placeId = await seedPlace(db);
        const { reserve } = await budgetBackedReserver(db);
        const counting = countingGoogle(2);
        let photoReservations = 0;
        const dying: BudgetReserver = async (ctx, input) => {
          if (input.kind.endpoint === "photo") {
            photoReservations += 1;
            if (photoReservations === 1) {
              throw new Error("BudgetActor.reserve timed out after 15000ms");
            }
          }
          return reserve(ctx, input);
        };
        const seams = {
          google: counting.google,
          storePhoto: filesPhotoStore(db),
        };
        await expect(
          (
            await activate(
              newPlaceActor(placeId, db, { ...seams, reserve: dying }),
            )
          ).enrichFromGoogle(deliveryCtx(crypto.randomUUID()), {
            googlePlaceId: "ChIJ_DEAD_LETTERED",
            maxPhotos: 2,
          }),
        ).rejects.toThrow(/timed out/);
        expect(counting.calls.photo).toBe(0);

        const actor = await activate(
          newPlaceActor(placeId, db, { ...seams, reserve }),
        );
        // A signed-in user's click: fresh details, so no outbox row — the
        // photo resume is the redelivery's (or the operator's) job.
        const user = await seedUser(db);
        const clicked = await actor.enrichFromGoogle(userCtx(user, "r-click"));
        expect(clicked.status).toBe("fresh");
        const queued = await db
          .select({ id: outbox.id })
          .from(outbox)
          .where(eq(outbox.targetId, placeId));
        expect(queued).toHaveLength(0);
        expect(counting.calls.photo).toBe(0);

        // The outbox gave up on the row; the operator repairs it without force.
        const repaired = await actor.enrichFromGoogle(
          adminCtx(crypto.randomUUID(), "photo-repair"),
          { maxPhotos: 2 },
        );
        expect(repaired.status).toBe("fresh");
        expect(repaired.photos).toHaveLength(2);
        expect(counting.calls.details).toBe(1);
        expect(counting.calls.photo).toBe(2);
        expect(await usageRows(db, placeId)).toHaveLength(counting.paid());
      });
    });
  },
);
