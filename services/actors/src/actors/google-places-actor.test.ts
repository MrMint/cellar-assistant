/**
 * `GooglePlacesActor` — C1 (§2.3).
 *
 * No test here reaches Google: the client is the injected seam B5 built, whose
 * production default throws loudly when `GOOGLE_PLACES_API_KEY` is unset.
 */
import type {
  Ctx,
  GooglePlacesSearchInput,
  ReserveInput,
  ReserveResult,
} from "@cellar-assistant/contracts";
import {
  adminCtx,
  BUDGET_ACTOR_ID,
  ForbiddenError,
  googlePlaceDetailsActorId,
  googlePlacesActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { apiUsageLog } from "@cellar-assistant/db";
import { and, eq } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { BudgetReserver } from "../lib/budget-reservers.ts";
import type { DbOrTx } from "../lib/db.ts";
import type {
  GooglePlaceDetails,
  GooglePlacesClient,
  GoogleSuggestion,
} from "../lib/google-places.ts";
import {
  GOOGLE_PLACES_SERVICE,
  PREFILL_DETAILS_FIELD_MASK,
  unconfiguredGooglePlacesClient,
} from "../lib/google-places.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  withTestDb,
} from "../lib/testing.ts";
import { BudgetActor } from "./budget-actor.ts";
import { GooglePlacesActor, toE164 } from "./google-places-actor.ts";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const HERE = { lng: -83.0, lat: 40.0 };

const userCtx = (viewerId: string | null = VIEWER): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const allowed: ReserveResult = {
  allowed: true,
  effectiveCostCents: 1,
  currentSpendCents: 1,
  limitCents: 500,
  requestCount: 1,
  freeTierLimit: 0,
  isEnabled: true,
  reason: "within budget",
  usageId: null,
};

const denied: ReserveResult = {
  ...allowed,
  allowed: false,
  reason: "budget exceeded",
};

const suggestion = (id: string, name: string): GoogleSuggestion => ({
  googlePlaceId: id,
  name,
  secondaryText: "123 Main St",
  types: ["bar"],
  location: HERE,
});

const fakeGoogle = (
  overrides: Partial<GooglePlacesClient> = {},
): GooglePlacesClient => ({
  textSearch: async () => null,
  details: async () => null,
  photo: async () => null,
  autocomplete: async () => null,
  nearbySearch: async () => null,
  ...overrides,
});

const newActor = (
  input: GooglePlacesSearchInput,
  google: GooglePlacesClient,
  reserve: BudgetReserver,
  viewerId: string | null = VIEWER,
): GooglePlacesActor =>
  new GooglePlacesActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(googlePlacesActorId(input, viewerId)),
    null as never,
    google,
    reserve,
  );

describe("GooglePlacesActor (§2.3)", () => {
  it("charges once and answers twice — the activation is the cache", async () => {
    const autocomplete = vi.fn(async () => [suggestion("g1", "Stagger Lee")]);
    const reserve = vi.fn<BudgetReserver>(async () => allowed);
    const input: GooglePlacesSearchInput = {
      mode: "autocomplete",
      input: "stag",
      location: HERE,
    };
    const actor = newActor(input, fakeGoogle({ autocomplete }), reserve);

    const first = await actor.search(userCtx(), input);
    const second = await actor.search(userCtx(), input);

    expect(first.suggestions.map((s) => s.name)).toEqual(["Stagger Lee"]);
    expect(second).toEqual(first);
    expect(autocomplete).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(actor.searchRuns).toBe(1);
  });

  it("reserves before calling Google, with the *caller's* ctx and the endpoint's cost", async () => {
    const reserve = vi.fn<BudgetReserver>(async () => allowed);
    const input: GooglePlacesSearchInput = {
      mode: "nearby",
      location: HERE,
    };
    await newActor(
      input,
      fakeGoogle({ nearbySearch: async () => [suggestion("g2", "Bar")] }),
      reserve,
    ).search(userCtx(), input);

    const [ctx, reservation] = reserve.mock.calls[0] ?? [];
    // Not a minted `system` ctx: §1.6 says only `OutboxActor` and job actors
    // construct one, and `src/lib/system-ctx.test.ts` enforces it. The
    // reservation goes through `BudgetActor.reserveForSearch`, whose
    // allow-list is what keeps a user ctx safe here.
    expect(ctx?.kind).toBe("user");
    expect(ctx?.viewerId).toBe(VIEWER);
    expect(reservation?.kind).toEqual({
      service: "google_places",
      endpoint: "nearby_search",
    });
    expect(reservation?.estimatedCostCents).toBe(4);
    // Who caused the spend is recorded even though it is not in the key.
    expect(reservation?.triggeredBy).toBe(VIEWER);
  });

  it("returns an empty, uncharged result when the budget denies", async () => {
    const nearbySearch = vi.fn(async () => [suggestion("g3", "Bar")]);
    const input: GooglePlacesSearchInput = { mode: "nearby", location: HERE };
    const result = await newActor(
      input,
      fakeGoogle({ nearbySearch }),
      async () => denied,
    ).search(userCtx(), input);

    expect(result).toEqual({
      suggestions: [],
      charged: false,
      reason: "budget exceeded",
    });
    expect(nearbySearch).not.toHaveBeenCalled();
  });

  it("does not cache a denial — raising the budget must take effect", async () => {
    const input: GooglePlacesSearchInput = { mode: "nearby", location: HERE };
    let allow = false;
    const actor = newActor(
      input,
      fakeGoogle({ nearbySearch: async () => [suggestion("g4", "Bar")] }),
      async () => (allow ? allowed : denied),
    );
    expect((await actor.search(userCtx(), input)).charged).toBe(false);
    allow = true;
    expect((await actor.search(userCtx(), input)).charged).toBe(true);
  });

  it("treats a Google failure as an empty answer, not a throw", async () => {
    const input: GooglePlacesSearchInput = {
      mode: "autocomplete",
      input: "stag",
      location: HERE,
    };
    const result = await newActor(
      input,
      fakeGoogle({ autocomplete: async () => null }),
      async () => allowed,
    ).search(userCtx(), input);
    expect(result.suggestions).toEqual([]);
    expect(result.charged).toBe(true);
    expect(result.reason).toBe("google returned no result");
  });

  it("is shared across viewers — the viewer is not in the key", () => {
    const input: GooglePlacesSearchInput = {
      mode: "autocomplete",
      input: "stag",
      location: HERE,
    };
    expect(googlePlacesActorId(input, VIEWER)).toBe(
      googlePlacesActorId(input, "22222222-2222-4222-8222-222222222222"),
    );
  });

  it("refuses an input that hashes elsewhere, before spending anything", async () => {
    const reserve = vi.fn<BudgetReserver>(async () => allowed);
    const input: GooglePlacesSearchInput = {
      mode: "autocomplete",
      input: "stag",
      location: HERE,
    };
    const actor = newActor(input, fakeGoogle(), reserve);
    await expect(
      actor.search(userCtx(), { ...input, input: "different" }),
    ).rejects.toThrow(ValidationError);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("refuses anonymous callers and malformed input", async () => {
    const input: GooglePlacesSearchInput = {
      mode: "autocomplete",
      input: "stag",
      location: HERE,
    };
    await expect(
      newActor(input, fakeGoogle(), async () => allowed, null).search(
        userCtx(null),
        input,
      ),
    ).rejects.toThrow(ForbiddenError);

    const empty: GooglePlacesSearchInput = {
      mode: "autocomplete",
      input: "  ",
      location: HERE,
    };
    await expect(
      newActor(empty, fakeGoogle(), async () => allowed).search(
        userCtx(),
        empty,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws loudly when Google is unconfigured, rather than faking success", async () => {
    const input: GooglePlacesSearchInput = { mode: "nearby", location: HERE };
    await expect(
      newActor(
        input,
        unconfiguredGooglePlacesClient,
        async () => allowed,
      ).search(userCtx(), input),
    ).rejects.toThrow(/GOOGLE_PLACES_API_KEY is unset/);
  });
});

/* -------------------------------------------------------------------------- */
/* The budget wiring: one usage row per call Google actually received          */
/* -------------------------------------------------------------------------- */

const { skip } = await resolveTestDatabase();

/**
 * The real `BudgetActor`, in-process on the same transaction, reached through
 * the same `reserveForSearch` door the sidecar reserver uses.
 *
 * The fakes above answer "allowed" whatever key they are handed, so a key
 * that replayed an earlier reservation looked exactly like one that did not —
 * which is how a month-long key survived. What is asserted below is the
 * ledger: `api_usage_log` rows against the calls the fake Google received.
 */
const budgetBackedReserver = async (
  db: DbOrTx,
): Promise<{ reserve: BudgetReserver; asked: ReserveInput[] }> => {
  const budget = await activate(createActor(BudgetActor, BUDGET_ACTOR_ID, db));
  const operator = adminCtx(crypto.randomUUID(), "budget-setup");
  for (const endpoint of ["autocomplete", "nearby_search"] as const) {
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
    return budget.reserveForSearch(ctx, input);
  };
  return { reserve, asked };
};

/** `reserveForSearch` forces `triggeredBy` to the viewer, so a fresh viewer
 *  per test isolates its rows from everything else in the month. */
const usageRows = async (db: DbOrTx, viewer: string) =>
  (
    await db
      .select({
        endpoint: apiUsageLog.endpoint,
        metadata: apiUsageLog.metadata,
      })
      .from(apiUsageLog)
      .where(
        and(
          eq(apiUsageLog.service, GOOGLE_PLACES_SERVICE),
          eq(apiUsageLog.triggeredBy, viewer),
        ),
      )
  ).map((row) => ({
    endpoint: row.endpoint,
    reservationId: (row.metadata as { reservationId?: string }).reservationId,
  }));

/**
 * A new instance on the same id is what Dapr hands the next caller after the
 * idle timeout deactivates the old one: same key, empty cache.
 */
const activation = (
  input: GooglePlacesSearchInput,
  viewer: string,
  db: DbOrTx,
  google: GooglePlacesClient,
  reserve: BudgetReserver,
): GooglePlacesActor =>
  new GooglePlacesActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(googlePlacesActorId(input, viewer)),
    db,
    google,
    reserve,
  );

describe.skipIf(skip)(
  "GooglePlacesActor → BudgetActor: one reservation per real call",
  () => {
    afterAll(closeTestDb);

    it("a re-activation that calls Google again is charged again; a cache hit is not", async () => {
      await withTestDb(async (db) => {
        const viewer = crypto.randomUUID();
        const { reserve, asked } = await budgetBackedReserver(db);
        const autocomplete = vi.fn(async () => [
          suggestion("g1", "Stagger Lee"),
        ]);
        const google = fakeGoogle({ autocomplete });
        const input: GooglePlacesSearchInput = {
          mode: "autocomplete",
          input: "stag",
          location: HERE,
        };

        // Activation 1: a miss and a hit. One call, one row.
        const first = activation(input, viewer, db, google, reserve);
        expect((await first.search(userCtx(viewer), input)).charged).toBe(true);
        await first.search(userCtx(viewer), input);
        expect(autocomplete).toHaveBeenCalledTimes(1);
        expect(await usageRows(db, viewer)).toHaveLength(1);

        // Activations 2 and 3, same key, after the idle window: each really
        // calls Google, so each is a row. A month-long key made these replays.
        await activation(input, viewer, db, google, reserve).search(
          userCtx(viewer),
          input,
        );
        await activation(input, viewer, db, google, reserve).search(
          userCtx(viewer),
          input,
        );
        expect(autocomplete).toHaveBeenCalledTimes(3);

        const rows = await usageRows(db, viewer);
        expect(rows).toHaveLength(autocomplete.mock.calls.length);
        expect(rows.every((row) => row.endpoint === "autocomplete")).toBe(true);
        expect(new Set(rows.map((row) => row.reservationId)).size).toBe(3);
        // A hit reserves nothing at all — not a replayed reservation.
        expect(asked).toHaveLength(3);
      });
    });

    it("a turn whose Google call failed is charged, and the retry that calls again is charged again", async () => {
      await withTestDb(async (db) => {
        const viewer = crypto.randomUUID();
        const { reserve } = await budgetBackedReserver(db);
        let failNext = true;
        const nearbySearch = vi.fn(async () => {
          if (failNext) {
            failNext = false;
            // After the reservation, and after Google may well have billed it.
            throw new Error("socket hang up reading the nearby response");
          }
          return [suggestion("g2", "Bar")];
        });
        const input: GooglePlacesSearchInput = {
          mode: "nearby",
          location: HERE,
        };
        const actor = activation(
          input,
          viewer,
          db,
          fakeGoogle({ nearbySearch }),
          reserve,
        );

        await expect(actor.search(userCtx(viewer), input)).rejects.toThrow(
          /socket hang up/,
        );
        // Nothing was cached, so the next turn asks Google again.
        expect((await actor.search(userCtx(viewer), input)).charged).toBe(true);
        await actor.search(userCtx(viewer), input);

        expect(nearbySearch).toHaveBeenCalledTimes(2);
        const rows = await usageRows(db, viewer);
        expect(rows).toHaveLength(nearbySearch.mock.calls.length);
        expect(rows.every((row) => row.endpoint === "nearby_search")).toBe(
          true,
        );
      });
    });
  },
);

/* -------------------------------------------------------------------------- */
/* G21: `details`, the create-place pre-fill                                   */
/* -------------------------------------------------------------------------- */

const PICKED = "ChIJ_picked-Place_1";

const googleDetails = (
  overrides: Partial<GooglePlaceDetails> = {},
): GooglePlaceDetails => ({
  googlePlaceId: PICKED,
  name: "Stagger Lee",
  formattedAddress: null,
  rating: null,
  userRatingsTotal: null,
  priceLevel: null,
  website: "https://stagger.test",
  phone: "(614) 555-0100",
  internationalPhone: "+1 614-555-0100",
  openingHours: null,
  types: ["bar", "restaurant"],
  businessStatus: null,
  editorialSummary: "A dim, friendly bar.",
  photos: [],
  attributions: [],
  ...overrides,
});

const detailsActor = (
  google: GooglePlacesClient,
  reserve: BudgetReserver,
  googlePlaceId = PICKED,
  db: DbOrTx = null as never,
): GooglePlacesActor =>
  new GooglePlacesActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(googlePlaceDetailsActorId(googlePlaceId)),
    db,
    google,
    reserve,
  );

describe("GooglePlacesActor.details (G21 — create-place pre-fill)", () => {
  it("returns only the pre-fill fields, fetched with the pre-fill mask, charged once per activation", async () => {
    const details = vi.fn<GooglePlacesClient["details"]>(async () =>
      googleDetails(),
    );
    const reserve = vi.fn<BudgetReserver>(async () => allowed);
    const actor = detailsActor(fakeGoogle({ details }), reserve);

    const first = await actor.details(userCtx(), { googlePlaceId: PICKED });
    const second = await actor.details(userCtx(), { googlePlaceId: PICKED });

    expect(first).toEqual({
      details: {
        googlePlaceId: PICKED,
        name: "Stagger Lee",
        phone: "+16145550100",
        website: "https://stagger.test",
        editorialSummary: "A dim, friendly bar.",
        types: ["bar", "restaurant"],
      },
      charged: true,
      reason: "within budget",
    });
    expect(second).toEqual(first);
    expect(details).toHaveBeenCalledTimes(1);
    expect(details.mock.calls[0]?.[1]).toEqual({
      fieldMask: PREFILL_DETAILS_FIELD_MASK,
    });
    // No photos, hours, rating or address in the mask.
    expect(PREFILL_DETAILS_FIELD_MASK).not.toContain("photos");
    expect(PREFILL_DETAILS_FIELD_MASK).not.toContain("regularOpeningHours");
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("reserves place_details at its price, with the caller's ctx, before Google", async () => {
    const order: string[] = [];
    const reserve = vi.fn<BudgetReserver>(async () => {
      order.push("reserve");
      return allowed;
    });
    await detailsActor(
      fakeGoogle({
        details: async () => {
          order.push("google");
          return googleDetails();
        },
      }),
      reserve,
    ).details(userCtx(), { googlePlaceId: PICKED });

    expect(order).toEqual(["reserve", "google"]);
    const [ctx, reservation] = reserve.mock.calls[0] ?? [];
    expect(ctx?.kind).toBe("user");
    expect(reservation?.kind).toEqual({
      service: GOOGLE_PLACES_SERVICE,
      endpoint: "place_details",
    });
    expect(reservation?.estimatedCostCents).toBe(3);
    expect(reservation?.triggeredBy).toBe(VIEWER);
  });

  it("a budget denial is an empty, uncharged answer that is not cached", async () => {
    const details = vi.fn(async () => googleDetails());
    let answer = denied;
    const actor = detailsActor(fakeGoogle({ details }), async () => answer);

    const refused = await actor.details(userCtx(), { googlePlaceId: PICKED });
    expect(refused).toEqual({
      details: null,
      charged: false,
      reason: "budget exceeded",
    });
    expect(details).not.toHaveBeenCalled();

    answer = allowed;
    const later = await actor.details(userCtx(), { googlePlaceId: PICKED });
    expect(later.details?.name).toBe("Stagger Lee");
  });

  it("an id Google does not know is charged and answers null details", async () => {
    const result = await detailsActor(
      fakeGoogle({ details: async () => null }),
      async () => allowed,
    ).details(userCtx(), { googlePlaceId: PICKED });
    expect(result).toEqual({
      details: null,
      charged: true,
      reason: "google returned no result",
    });
  });

  it("falls back to the national number when there is no international one", async () => {
    const result = await detailsActor(
      fakeGoogle({
        details: async () => googleDetails({ internationalPhone: null }),
      }),
      async () => allowed,
    ).details(userCtx(), { googlePlaceId: PICKED });
    expect(result.details?.phone).toBe("(614) 555-0100");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("020 7946 0958")).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });

  it("refuses anonymous callers, malformed ids and an id keyed elsewhere — before spending", async () => {
    const reserve = vi.fn<BudgetReserver>(async () => allowed);
    const actor = detailsActor(fakeGoogle(), reserve);
    await expect(
      actor.details(userCtx(null), { googlePlaceId: PICKED }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      actor.details(userCtx(), { googlePlaceId: "../places/x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      actor.details(userCtx(), { googlePlaceId: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      actor.details(userCtx(), { googlePlaceId: "ChIJ_someone_else" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("never shares an activation with a search", () => {
    expect(googlePlaceDetailsActorId(PICKED)).not.toBe(
      googlePlacesActorId(
        { mode: "autocomplete", input: PICKED, location: HERE },
        null,
      ),
    );
    expect(googlePlaceDetailsActorId(` ${PICKED} `)).toBe(
      googlePlaceDetailsActorId(PICKED),
    );
  });
});

describe.skipIf(skip)(
  "GooglePlacesActor.details → BudgetActor.reserveForSearch",
  () => {
    afterAll(closeTestDb);

    it("the search door admits place_details, and writes one usage row per real call", async () => {
      await withTestDb(async (db) => {
        const viewer = crypto.randomUUID();
        const budget = await activate(
          createActor(BudgetActor, BUDGET_ACTOR_ID, db),
        );
        await budget.setBudget(adminCtx(crypto.randomUUID(), "budget-setup"), {
          kind: { service: GOOGLE_PLACES_SERVICE, endpoint: "place_details" },
          monthlyBudgetCents: 1_000_000,
          freeTierMonthlyRequests: 0,
          isEnabled: true,
        });
        const reserve: BudgetReserver = (ctx, input) =>
          budget.reserveForSearch(ctx, input);
        const details = vi.fn(async () => googleDetails());
        const google = fakeGoogle({ details });

        const first = detailsActor(google, reserve, PICKED, db);
        expect(
          (await first.details(userCtx(viewer), { googlePlaceId: PICKED }))
            .charged,
        ).toBe(true);
        await first.details(userCtx(viewer), { googlePlaceId: PICKED });
        // A re-activation (idle timeout) calls Google again and is a row.
        await detailsActor(google, reserve, PICKED, db).details(
          userCtx(viewer),
          { googlePlaceId: PICKED },
        );

        expect(details).toHaveBeenCalledTimes(2);
        const rows = await usageRows(db, viewer);
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.endpoint === "place_details")).toBe(
          true,
        );
      });
    });
  },
);
