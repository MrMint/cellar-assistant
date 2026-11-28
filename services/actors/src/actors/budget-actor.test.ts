/**
 * `BudgetActor` against a real Postgres (B5, migration plan §2.1, §1.5).
 *
 * Every test runs inside `withTestDb`'s rolled-back transaction, so the
 * `api_budget_config` rows it writes never survive — which matters more here
 * than elsewhere, because this actor caches that table on activate and a
 * leftover row would change another test's decision.
 *
 * Fixture services are prefixed and unique per call so nothing collides with
 * the `google_places` rows a real deployment configures.
 */
import {
  adminCtx,
  anonymousCtx,
  BudgetExceededError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  type ReserveInput,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { apiUsageLog } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { freeModelProviders } from "../lib/ai/billing.ts";
import type { DbOrTx } from "../lib/db.ts";
import { forwardCtx } from "../lib/delivery.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import {
  activate,
  claimingDelivery,
  closeTestDb,
  createActor,
  deliveryCtx,
  resolveTestDatabase,
  testDb,
  withTestDb,
} from "../lib/testing.ts";
import type { ModelReserveInput } from "./budget-actor.ts";
import {
  AI_MODEL_SERVICE,
  BudgetActor,
  DEFAULT_GOOGLE_PLACES_MONTHLY_PAID_CENTS,
  DEFAULT_GOOGLE_PLACES_USER_MONTHLY_CALLS,
  GOOGLE_PLACES_BUDGET_SERVICE,
  googlePlacesPoolRefusal,
  MODEL_RATES,
  MODEL_SEAMS,
  MODEL_SPENDERS,
  modelCallNanoCents,
  monthStart,
  NANOCENTS_PER_CENT,
  nextMonthStart,
  parseGooglePlacesPaidCents,
  parseModelPrices,
  parseRequestCaps,
  parseUserCapConfig,
  parseUserCaps,
  periodLimit,
  readModelBudgetPolicy,
  UNKNOWN_PAID_RATE,
  USER_CAP_REASON,
  USER_CAPS,
} from "./budget-actor.ts";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const admin = adminCtx(ADMIN, "r-admin");
const user = userCtx(USER, "r-user");
const system = systemCtx("r-system");
const anonymous = anonymousCtx("r-anon");

let seq = 0;
const fixtureService = (): string => {
  seq += 1;
  return `__b5_test_${Date.now().toString(36)}_${seq}`;
};

/**
 * A key of its own for one reservation. `ReserveInput.reservationId` is
 * required: nothing infers it from the ctx any more, so a test that means
 * "a separate call" says so with a fresh key, and one that means "the same
 * call again" reuses one.
 */
const key = (): string => crypto.randomUUID();
const call = (input: Omit<ReserveInput, "reservationId">): ReserveInput => ({
  ...input,
  reservationId: key(),
});

const newBudgetActor = (db: DbOrTx): BudgetActor =>
  createActor(BudgetActor, "singleton", db);

/** A fresh activation, as the next call into the singleton would see. */
const reactivate = (db: DbOrTx): Promise<BudgetActor> =>
  activate(
    new BudgetActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId("singleton"),
      db,
    ),
  );

/** An instant in the previous UTC month, for rows a test backdates. */
const lastMonth = (): Date => new Date(monthStart().getTime() - 86_400_000);

/**
 * Run `fn` with these environment variables set, restoring every one of them
 * afterwards — `BudgetActor` reads its overrides from `process.env` on
 * activation, so a test that sets one must not leak it into the next.
 */
const withEnv = async <T>(
  vars: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = Object.fromEntries(
    Object.keys(vars).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("BudgetActor (B5)", () => {
  afterAll(closeTestDb);

  it("is tagged entity — it owns api_budget_config and api_usage_log (§2.1)", () => {
    expect(BudgetActor.category).toBe("entity");
  });

  it("monthStart is the first instant of the current UTC month", () => {
    expect(monthStart(new Date("2026-09-09T11:30:00.000Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    // The last instant of December still belongs to December.
    expect(monthStart(new Date("2026-12-31T23:59:59.999Z")).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
  });

  /* ---------------------------------------------------------------------- */
  /* Viewers                                                                 */
  /* ---------------------------------------------------------------------- */

  it("reserve: system and admin may spend; a signed-in user and an anonymous caller may not", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const input = {
        kind: { service, endpoint: "call" },
        estimatedCostCents: 1,
      };

      expect((await actor.reserve(system, call(input))).allowed).toBe(true);
      expect((await actor.reserve(admin, call(input))).allowed).toBe(true);
      await expect(actor.reserve(user, call(input))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        actor.reserve(anonymous, call(input)),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("setBudget and config are admin only — not even system", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      const input = {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 10,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      };
      for (const ctx of [system, user, anonymous]) {
        await expect(actor.setBudget(ctx, input)).rejects.toBeInstanceOf(
          ForbiddenError,
        );
        await expect(actor.config(ctx)).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect((await actor.setBudget(admin, input)).service).toBe(service);
      expect(
        (await actor.config(admin)).some((c) => c.service === service),
      ).toBe(true);
    });
  });

  it("usage: admin and system may read spend; a user may not", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const range = {
        from: "2026-01-01T00:00:00.000Z",
        to: "2027-01-01T00:00:00.000Z",
      };
      expect((await actor.usage(admin, range)).from).toBe(range.from);
      expect((await actor.usage(system, range)).to).toBe(range.to);
      await expect(actor.usage(user, range)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(actor.usage(anonymous, range)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The decision                                                            */
  /* ---------------------------------------------------------------------- */

  it("reserve: an unconfigured (service, endpoint) is refused — it fails closed, unlike _utils/budget.ts", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const result = await actor.reserve(system, {
        reservationId: key(),
        kind: { service: fixtureService(), endpoint: "typo" },
        estimatedCostCents: 4,
      });
      expect(result.allowed).toBe(false);
      expect(result.usageId).toBeNull();
      expect(result.reason).toMatch(/no budget is configured/);
    });
  });

  it("reserve: a disabled service is refused", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 1000,
        freeTierMonthlyRequests: 1000,
        isEnabled: false,
      });
      const result = await actor.reserve(system, {
        reservationId: key(),
        kind: { service, endpoint: "call" },
        estimatedCostCents: 4,
      });
      expect(result.allowed).toBe(false);
      expect(result.isEnabled).toBe(false);
    });
  });

  it("reserve: inside the free tier the call is allowed and costs nothing; the request still counts", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 0,
        freeTierMonthlyRequests: 2,
        isEnabled: true,
      });
      const input = {
        kind: { service, endpoint: "call" },
        estimatedCostCents: 4,
      };

      const first = await actor.reserve(system, call(input));
      expect(first.allowed).toBe(true);
      expect(first.effectiveCostCents).toBe(0);
      expect(first.reason).toMatch(/within free tier/);

      const second = await actor.reserve(system, call(input));
      expect(second.allowed).toBe(true);
      expect(second.requestCount).toBe(1);

      // Free tier exhausted, and `monthly_budget_cents = 0` — the "free tier
      // only" configuration almost every production row uses.
      const third = await actor.reserve(system, call(input));
      expect(third.allowed).toBe(false);
      expect(third.reason).toMatch(/free tier exhausted/);
      expect(third.usageId).toBeNull();
    });
  });

  /**
   * The acceptance proof: past its limit, `BudgetActor` refuses as a typed
   * `BudgetExceededError`.
   */
  it("refuses spend past the monthly limit — reserve returns allowed:false, reserveOrThrow raises BudgetExceededError", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "place_details" },
        // Room for exactly two 3-cent calls.
        monthlyBudgetCents: 6,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const input = {
        kind: { service, endpoint: "place_details" },
        estimatedCostCents: 3,
      };

      expect(
        (await actor.reserve(system, call(input))).effectiveCostCents,
      ).toBe(3);
      expect((await actor.reserve(system, call(input))).currentSpendCents).toBe(
        3,
      );

      const denied = await actor.reserve(system, call(input));
      expect(denied.allowed).toBe(false);
      expect(denied.currentSpendCents).toBe(6);
      expect(denied.limitCents).toBe(6);
      expect(denied.usageId).toBeNull();
      expect(denied.reason).toMatch(/monthly budget exhausted/);

      // The resolver-facing half: the same denial, as a typed error.
      const raised = await actor
        .reserveOrThrow(system, call(input))
        .then(() => null)
        .catch((error: unknown) => error);
      expect(raised).toBeInstanceOf(BudgetExceededError);
      expect((raised as BudgetExceededError).code).toBe("BUDGET_EXCEEDED");
      expect((raised as Error).message).toMatch(/monthly budget exhausted/);

      // And nothing was charged for either refusal.
      const rows = await db
        .select({ id: apiUsageLog.id })
        .from(apiUsageLog)
        .where(eq(apiUsageLog.service, service));
      expect(rows).toHaveLength(2);

      console.log(
        `[B5 acceptance] BudgetExceededError: code=${(raised as BudgetExceededError).code} ` +
          `message="${(raised as Error).message}" ` +
          `(spend ${denied.currentSpendCents}/${denied.limitCents} cents, ` +
          `${rows.length} usage rows written)`,
      );
    });
  });

  it("reserveOrThrow: an allowed spend returns the same result reserve would", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const result = await actor.reserveOrThrow(system, {
        reservationId: key(),
        kind: { service, endpoint: "call" },
        estimatedCostCents: 7,
      });
      expect(result.allowed).toBe(true);
      expect(result.effectiveCostCents).toBe(7);
      expect(result.usageId).not.toBeNull();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Idempotency and the check-then-log race                                 */
  /* ---------------------------------------------------------------------- */

  it("reserve: a repeated key replays the first decision and writes no second row (§8.4)", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const input = {
        kind: { service, endpoint: "call" },
        estimatedCostCents: 5,
        reservationId: key(),
      };

      const first = await actor.reserve(system, input);
      const retry = await actor.reserve(system, input);

      expect(retry.allowed).toBe(true);
      expect(retry.usageId).toBe(first.usageId);
      expect(retry.reason).toMatch(/already reserved/);

      const rows = await db
        .select({ id: apiUsageLog.id })
        .from(apiUsageLog)
        .where(eq(apiUsageLog.service, service));
      expect(rows).toHaveLength(1);
    });
  });

  /**
   * The defect this replaced: `#reserve` defaulted a missing key to
   * the delivering outbox row's id, so every reservation inside one delivery
   * after the first replayed it and wrote nothing. The delivery ctx must not supply a
   * key at all — two reservations in one delivery, each naming its own call,
   * are two rows; and one naming no call is refused rather than keyed on the
   * delivery behind the caller's back.
   */
  it("reserve: a delivery ctx is never a key — two calls in one delivery are two rows, and no key is refused", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const delivery = deliveryCtx(crypto.randomUUID());
      const input = {
        kind: { service, endpoint: "call" },
        estimatedCostCents: 5,
      };

      const first = await actor.reserve(delivery, call(input));
      const second = await actor.reserve(delivery, call(input));
      expect(second.reason).not.toMatch(/already reserved/);
      expect(second.usageId).not.toBe(first.usageId);

      for (const missing of [undefined, "", "   "]) {
        await expect(
          actor.reserve(delivery, {
            ...input,
            reservationId: missing,
          } as unknown as ReserveInput),
        ).rejects.toBeInstanceOf(ValidationError);
      }

      const rows = await db
        .select({ id: apiUsageLog.id })
        .from(apiUsageLog)
        .where(eq(apiUsageLog.service, service));
      expect(rows).toHaveLength(2);
    });
  });

  /**
   * `reserveForSearch` is reached with the asking user's own ctx, whose
   * request id is whatever `x-request-id` the edge let through. Sending
   * `outbox:<uuid>` used to make the default reservation key a "delivery"
   * key: every repeat collided with the first, returned its decision and
   * wrote no usage row — autocomplete charged once, however often it ran.
   */
  it("reserveForSearch: a user whose request id looks like a delivery cannot make it the key", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const kind = { service: "google_places", endpoint: "autocomplete" };
      await actor.setBudget(admin, {
        kind,
        monthlyBudgetCents: 1_000,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const spoofed = claimingDelivery(userCtx(USER, "r"), crypto.randomUUID());

      // Without a key of its own the reservation is refused — the spoofed
      // request id is never promoted to one.
      await expect(
        actor.reserveForSearch(spoofed, {
          kind,
          estimatedCostCents: 0,
        } as unknown as ReserveInput),
      ).rejects.toBeInstanceOf(ValidationError);

      const first = await actor.reserveForSearch(spoofed, {
        kind,
        estimatedCostCents: 0,
        reservationId: key(),
      });
      const second = await actor.reserveForSearch(spoofed, {
        kind,
        estimatedCostCents: 0,
        reservationId: key(),
      });
      expect(second.reason).not.toMatch(/already reserved/);
      expect(second.usageId).not.toBe(first.usageId);
      expect(second.currentSpendCents).toBe(
        first.currentSpendCents + first.effectiveCostCents,
      );
    });
  });

  it("reserve: per-photo keys in one delivery are a row each, and a repeated one replays", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "photo" },
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const delivery = deliveryCtx(crypto.randomUUID());
      const base = {
        kind: { service, endpoint: "photo" },
        estimatedCostCents: 1,
      };

      // `enrichFromGoogle` charges once per photo inside one delivery.
      await actor.reserve(delivery, { ...base, reservationId: "photo-0" });
      await actor.reserve(delivery, { ...base, reservationId: "photo-1" });
      const repeat = await actor.reserve(delivery, {
        ...base,
        reservationId: "photo-0",
      });
      expect(repeat.reason).toMatch(/already reserved/);

      const rows = await db
        .select({ id: apiUsageLog.id })
        .from(apiUsageLog)
        .where(eq(apiUsageLog.service, service));
      expect(rows).toHaveLength(2);
    });
  });

  /**
   * The replay lookup is bounded to the current month. Unbounded, it scanned
   * the endpoint's whole history inside the singleton on every reservation,
   * and a hit in an earlier month answered "already reserved" for a call that
   * then counted against no month at all.
   */
  it("reserve: an id first used in an earlier month is charged again, not replayed", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "photo" },
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const [old] = await db
        .insert(apiUsageLog)
        .values({
          service,
          endpoint: "photo",
          estimatedCostCents: 5,
          metadata: { reservationId: "photo-0" },
          createdAt: lastMonth(),
        })
        .returning({ id: apiUsageLog.id });

      const result = await actor.reserve(system, {
        kind: { service, endpoint: "photo" },
        estimatedCostCents: 5,
        reservationId: "photo-0",
      });
      expect(result.reason).not.toMatch(/already reserved/);
      expect(result.usageId).not.toBe(old?.id);
      expect(result.effectiveCostCents).toBe(5);
      // This month's ledger holds it; last month's is untouched.
      expect(result.currentSpendCents).toBe(0);
    });
  });

  it("reserve: the decision and its usage row are one transaction — the next reserve sees the spend", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 10,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const input = {
        kind: { service, endpoint: "call" },
        estimatedCostCents: 4,
      };

      const first = await actor.reserve(system, call(input));
      expect(first.currentSpendCents).toBe(0);
      // The old helper's window: this second caller would still have read 0.
      const second = await actor.reserve(system, call(input));
      expect(second.currentSpendCents).toBe(4);
      const third = await actor.reserve(system, call(input));
      expect(third.allowed).toBe(false);
      expect(third.currentSpendCents).toBe(8);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Configuration and reporting                                             */
  /* ---------------------------------------------------------------------- */

  it("setBudget: upserts, is visible to the very next reserve, and rejects negative numbers", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      const kind = { service, endpoint: "call" };

      await actor.setBudget(admin, {
        kind,
        monthlyBudgetCents: 0,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      expect(
        (
          await actor.reserve(system, {
            reservationId: key(),
            kind,
            estimatedCostCents: 1,
          })
        ).allowed,
      ).toBe(false);

      const updated = await actor.setBudget(admin, {
        kind,
        monthlyBudgetCents: 50,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      expect(updated.monthlyBudgetCents).toBe(50);
      expect(
        (
          await actor.reserve(system, {
            reservationId: key(),
            kind,
            estimatedCostCents: 1,
          })
        ).allowed,
      ).toBe(true);

      // And a fresh activation reads the same row back from Postgres.
      const fresh = await reactivate(db);
      expect(
        (await fresh.config(admin)).find((c) => c.service === service)
          ?.monthlyBudgetCents,
      ).toBe(50);

      await expect(
        actor.setBudget(admin, {
          kind,
          monthlyBudgetCents: -1,
          freeTierMonthlyRequests: 0,
          isEnabled: true,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("usage: buckets by (service, endpoint) inside the window and rejects a backwards range", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      for (const endpoint of ["details", "photo"]) {
        await actor.setBudget(admin, {
          kind: { service, endpoint },
          monthlyBudgetCents: 100,
          freeTierMonthlyRequests: 0,
          isEnabled: true,
        });
      }
      await actor.reserve(system, {
        reservationId: key(),
        kind: { service, endpoint: "details" },
        estimatedCostCents: 3,
      });
      await actor.reserve(system, {
        reservationId: key(),
        kind: { service, endpoint: "photo" },
        estimatedCostCents: 1,
      });
      await actor.reserve(system, {
        reservationId: key(),
        kind: { service, endpoint: "photo" },
        estimatedCostCents: 1,
      });

      const report = await actor.usage(admin, {
        from: monthStart().toISOString(),
        to: new Date(Date.now() + 60_000).toISOString(),
        service,
      });
      expect(report.buckets).toEqual([
        { service, endpoint: "details", requestCount: 1, spendCents: 3 },
        { service, endpoint: "photo", requestCount: 2, spendCents: 2 },
      ]);
      expect(report.totalRequestCount).toBe(3);
      expect(report.totalSpendCents).toBe(5);

      await expect(
        actor.usage(admin, {
          from: "2026-02-01T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.usage(admin, { from: "not a date", to: "also not" }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("reserve: a non-uuid entityId or triggeredBy is a ValidationError, not a 500", async () => {
    // Found by running B5's live acceptance against the compose stack: both
    // columns are `uuid`, so a caller bug used to reach Postgres and come back
    // as an unmapped 500 through the sidecar.
    await withTestDb(async (db) => {
      const service = fixtureService();
      const actor = await activate(newBudgetActor(db));
      const kind = { service, endpoint: "call" };
      await actor.setBudget(admin, {
        kind,
        monthlyBudgetCents: 100,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });

      await expect(
        actor.reserve(system, {
          reservationId: key(),
          kind,
          estimatedCostCents: 1,
          triggeredBy: "b5-admin",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.reserve(system, {
          reservationId: key(),
          kind,
          estimatedCostCents: 1,
          entityId: "not-a-uuid",
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      // Null attribution is fine — a system turn often has no viewer.
      const ok = await actor.reserve(system, {
        reservationId: key(),
        kind,
        estimatedCostCents: 1,
        triggeredBy: null,
        entityId: null,
      });
      expect(ok.allowed).toBe(true);
    });
  });

  it("reserve: rejects a fractional or negative cost and a blank service", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const kind = { service: fixtureService(), endpoint: "call" };
      await expect(
        actor.reserve(system, {
          reservationId: key(),
          kind,
          estimatedCostCents: 1.5,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.reserve(system, {
          reservationId: key(),
          kind,
          estimatedCostCents: -1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.reserve(system, {
          reservationId: key(),
          kind: { service: "  ", endpoint: "call" },
          estimatedCostCents: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* X1c · model calls                                                           */
/* -------------------------------------------------------------------------- */

/**
 * These four are pure and need no database, so they sit outside the
 * `skipIf(skip)` block: a malformed operator override has to fail the same way
 * on a laptop with no Postgres as it does in CI.
 */
describe("model pricing and its overrides (X1c)", () => {
  it("prices a paid model from the table and a free provider at zero", () => {
    const call = {
      model: "gemini-2.5-flash-001",
      inputTokens: 1000,
      outputTokens: 1000,
    };
    // Longest-prefix match, so a dated suffix prices as its family — and
    // `-flash-001` must not fall through to the cheaper `-flash-lite` row.
    const flash = MODEL_RATES["gemini-2.5-flash"];
    expect(modelCallNanoCents({ ...call, provider: "vertex-ai" })).toBe(
      (flash?.input ?? 0) + (flash?.output ?? 0),
    );
    expect(modelCallNanoCents({ ...call, provider: "ollama" })).toBe(0);
    // `openai-compatible` is free only where it points at a server we host;
    // the default free set is the providers that are free wherever they are.
    expect(
      modelCallNanoCents(
        { ...call, provider: "openai-compatible" },
        {},
        freeModelProviders({ OPENAI_COMPAT_ENDPOINT: "http://vllm:8000" }).chat,
      ),
    ).toBe(0);
  });

  /**
   * `openai-compatible` names a wire format, and api.openai.com speaks it
   * (`config.ts`, `openai-compatible.ts`). It used to be priced at zero by
   * name, so a deployment billed by OpenAI booked every call as free and the
   * cents cap could never bind.
   */
  it("prices openai-compatible pointed at a hosted API as a paid provider", () => {
    const hosted = freeModelProviders({
      OPENAI_COMPAT_ENDPOINT: "https://api.openai.com",
    });
    const call = {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
      inputTokens: 1000,
      outputTokens: 1000,
    };
    // Nobody has priced it, so it is charged the dearest rate, not nothing…
    expect(modelCallNanoCents(call, {}, hosted.chat)).toBe(
      UNKNOWN_PAID_RATE.input + UNKNOWN_PAID_RATE.output,
    );
    // …and an operator who knows the real rate says so the usual way.
    expect(
      modelCallNanoCents(
        call,
        parseModelPrices("gpt-4.1-mini=40000000/160000000"),
        hosted.chat,
      ),
    ).toBe(200_000_000);
  });

  /**
   * The case above has only one matching key, so it cannot tell longest-prefix
   * from shortest-prefix — inverting the comparison left it green (mutation
   * audit, 2026-09-27). This is the case with two: `gemini-2.5-flash` and
   * `gemini-2.5-flash-lite` both prefix a dated lite id, and only the longer
   * one is its price.
   */
  it("prices a model by its longest matching prefix, not its shortest", () => {
    const lite = MODEL_RATES["gemini-2.5-flash-lite"];
    const flash = MODEL_RATES["gemini-2.5-flash"];
    expect(lite?.input).not.toBe(flash?.input);
    expect(
      modelCallNanoCents({
        provider: "vertex-ai",
        model: "gemini-2.5-flash-lite-001",
        inputTokens: 1000,
        outputTokens: 1000,
      }),
    ).toBe((lite?.input ?? 0) + (lite?.output ?? 0));
  });

  it("charges an unknown paid model the dearest rate, not nothing", () => {
    const unknown = modelCallNanoCents({
      provider: "vertex-ai",
      model: "some-model-nobody-has-priced",
      inputTokens: 1000,
      outputTokens: 0,
    });
    expect(unknown).toBe(UNKNOWN_PAID_RATE.input);
    expect(unknown).toBeGreaterThan(
      MODEL_RATES["gemini-2.5-flash"]?.input ?? 0,
    );
  });

  it("AI_MODEL_PRICES overrides the table, and a typo throws", () => {
    const overrides = parseModelPrices("my-model=1000/2000");
    expect(
      modelCallNanoCents(
        {
          provider: "vertex-ai",
          model: "my-model-v2",
          inputTokens: 1000,
          outputTokens: 1000,
        },
        overrides,
      ),
    ).toBe(3000);
    expect(parseModelPrices(undefined)).toEqual({});
    expect(() => parseModelPrices("my-model=cheap")).toThrow(ValidationError);
  });

  /**
   * Compose passes both overrides through with an empty default
   * (`infra/docker-compose.yml`), so empty has to mean "none" rather than
   * "malformed" — or every stack with the variable unset refuses to boot.
   */
  it("reads an empty override as no overrides, and refuses what would not survive as a number", () => {
    expect(parseModelPrices("")).toEqual({});
    expect(parseModelPrices("  ")).toEqual({});
    expect(parseRequestCaps("")).toEqual({});
    expect(
      readModelBudgetPolicy({
        AI_MODEL_PRICES: "",
        AI_BUDGET_MAX_REQUESTS: "",
      }),
    ).toMatchObject({ modelPrices: {}, modelRequestCaps: {} });
    // A digit string past 2^53 parses as a *different* number, silently.
    expect(() => parseModelPrices(`m=1/${"9".repeat(20)}`)).toThrow(
      ValidationError,
    );
    expect(() => parseRequestCaps(`embedding=${"9".repeat(20)}`)).toThrow(
      ValidationError,
    );
    expect(() => parseModelPrices("=1/2")).toThrow(ValidationError);
    expect(() => readModelBudgetPolicy({ OPENAI_COMPAT_FREE: "yes" })).toThrow(
      ValidationError,
    );
  });

  it("AI_BUDGET_MAX_REQUESTS only names seams that exist", () => {
    expect(parseRequestCaps("embedding=5,menu_match=7")).toEqual({
      embedding: 5,
      menu_match: 7,
    });
    expect(() => parseRequestCaps("embedings=5")).toThrow(ValidationError);
    expect(() => parseRequestCaps("embedding=lots")).toThrow(ValidationError);
  });
});

describe.skipIf(skip)("BudgetActor.reserveForModel (X1c)", () => {
  afterAll(closeTestDb);

  const paid = (over: Partial<ModelReserveInput> = {}): ModelReserveInput => ({
    seam: "menu_match",
    provider: "vertex-ai",
    model: "gemini-2.5-flash",
    inputTokens: 1000,
    outputTokens: 1000,
    reservationId: `m-${Math.random()}`,
    ...over,
  });

  it("refuses a seam that is not on the allow-list, and an anonymous caller", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      await expect(
        actor.reserveForModel(system, paid({ seam: "summarise_everything" })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.reserveForModel(anonymous, paid()),
      ).rejects.toBeInstanceOf(ForbiddenError);
      // A user turn is allowed, unlike `reserve`: `ItemOnboardingActor.start`
      // and `PlaceCreationActor.createPlace` are user turns and a seam may not
      // mint a system ctx (§1.6).
      expect((await actor.reserveForModel(user, paid())).allowed).toBe(true);
    });
  });

  /**
   * An outbox delivery runs as `systemCtx`, so a model call made inside one
   * — every embedding regeneration, every menu extraction — used to be booked
   * to nobody. It is now booked to whoever enqueued the delivery. That is all
   * it changes: what a caller may do is still decided by its own ctx.
   */
  it("attributes a model call inside a delivery to whoever enqueued it, and allows nothing more", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const target = OUTBOX_TARGETS["MenuScanActor.process"];
      const delivery = {
        targetId: "00000000-0000-4000-8000-00000000000a",
        payload: { menuScanId: "00000000-0000-4000-8000-00000000000a" },
      };
      const attributed = await enqueueOutbox(db, target, delivery, {
        attributeTo: user,
      });
      const systemOriginated = await enqueueOutbox(db, target, delivery);

      const bookedTo = async (
        ctx: Parameters<typeof actor.reserveForModel>[0],
      ) => {
        const reserved = await actor.reserveForModel(ctx, paid());
        const [row] = await db
          .select({ triggeredBy: apiUsageLog.triggeredBy })
          .from(apiUsageLog)
          .where(eq(apiUsageLog.id, reserved.usageId ?? ""));
        return row?.triggeredBy ?? null;
      };

      expect(await bookedTo(deliveryCtx(attributed))).toBe(USER);
      expect(await bookedTo(deliveryCtx(systemOriginated))).toBeNull();
      expect(await bookedTo(systemCtx("maintenance:reap"))).toBeNull();
      // The model call is made through the typed client, which strips the
      // delivery and keeps its attribution (`forwardCtx`) — this is the ctx
      // BudgetActor actually receives from inside a delivery.
      expect(await bookedTo(forwardCtx(deliveryCtx(attributed)))).toBe(USER);
      expect(forwardCtx(deliveryCtx(attributed)).delivery).toBeUndefined();

      // A user turn is its own viewer, whatever its request id claims to be.
      const OTHER = "33333333-3333-4333-8333-333333333333";
      expect(
        await bookedTo(claimingDelivery(userCtx(OTHER, "r"), attributed)),
      ).toBe(OTHER);
      // And the attribution lends no authority: a signed-out caller naming
      // the attributed delivery is refused exactly as before.
      await expect(
        actor.reserveForModel(
          claimingDelivery(anonymousCtx("r"), attributed),
          paid(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("attributes the spend to the viewer, whatever the caller said", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const result = await actor.reserveForModel(user, paid());
      const [row] = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, result.usageId ?? ""));
      expect(row?.triggeredBy).toBe(USER);
      expect(row?.service).toBe(AI_MODEL_SERVICE);
      expect(row?.endpoint).toBe("menu_match");
      expect((row?.metadata as Record<string, unknown>)?.model).toBe(
        "gemini-2.5-flash",
      );
    });
  });

  it("carries sub-cent prices so the integer ledger stays exact", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      // 0.28 cents each: 3e7 nanocents of input plus 2.5e8 of output. Four of
      // them is 1.12 cents, so the first three book nothing and the fourth
      // books the whole cent they crossed.
      const booked: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        booked.push(
          (await actor.reserveForModel(system, paid())).effectiveCostCents,
        );
      }
      expect(booked).toEqual([0, 0, 0, 1]);

      const usage = await actor.usage(admin, {
        from: monthStart().toISOString(),
        to: new Date(Date.now() + 86_400_000).toISOString(),
        service: AI_MODEL_SERVICE,
        endpoint: "menu_match",
      });
      // Rounding each call to a whole cent would have said 0 or 4 here. The
      // truth is 1.12, and 1 is that floored.
      expect(usage.totalSpendCents).toBe(1);
      expect(usage.totalRequestCount).toBe(4);
    });
  });

  it("a free provider still costs a request, which is what bounds a local loop", async () => {
    const previous = process.env.AI_BUDGET_MAX_REQUESTS;
    process.env.AI_BUDGET_MAX_REQUESTS = "menu_match=2";
    try {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        const local = () => paid({ provider: "ollama", model: "gemma3:4b" });

        const first = await actor.reserveForModel(system, local());
        const second = await actor.reserveForModel(system, local());
        expect([first, second].map((r) => r.effectiveCostCents)).toEqual([
          0, 0,
        ]);

        // Nothing has been spent and nothing ever will be, and the loop is
        // stopped anyway. This is the whole argument for metering the free
        // providers: the bound that catches a runaway seam has to be the one
        // that does not depend on the money.
        const third = await actor.reserveForModel(system, local());
        expect(third.allowed).toBe(false);
        expect(third.currentSpendCents).toBe(0);
        expect(third.reason).toMatch(/2 of its 2 model calls/);
      });
    } finally {
      if (previous === undefined) delete process.env.AI_BUDGET_MAX_REQUESTS;
      else process.env.AI_BUDGET_MAX_REQUESTS = previous;
    }
  });

  it("an api_budget_config row overrides the built-in default", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      // Unconfigured is not unbounded — it is `MODEL_SPENDERS`' default.
      expect((await actor.reserveForModel(system, paid())).limitCents).toBe(
        MODEL_SPENDERS.menu_match.defaultMonthlyBudgetCents,
      );

      await actor.setBudget(admin, {
        kind: { service: AI_MODEL_SERVICE, endpoint: "menu_match" },
        monthlyBudgetCents: 0,
        freeTierMonthlyRequests: 0,
        isEnabled: false,
      });
      const off = await actor.reserveForModel(system, paid());
      expect(off.allowed).toBe(false);
      expect(off.reason).toMatch(/is disabled/);
    });
  });

  /**
   * A model reservation stands for exactly one model call, so a second
   * reservation under the same id can only be a second call — and answering it
   * "already reserved, allowed" was an uncounted allow: no request counted, no
   * cap checked, no row written, and the model called anyway. The live ledger
   * showed ids repeating after a restart (`…:outbox:ed55…:1..3` after `:10`).
   * `lib/ai/budget.ts` now mints a uuid per call; this is the actor refusing
   * to trust that.
   */
  it("refuses a repeated model reservation id rather than allowing it uncounted", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const first = await actor.reserveForModel(
        system,
        paid({ reservationId: "dup-1" }),
      );
      expect(first.allowed).toBe(true);
      await expect(
        actor.reserveForModel(system, paid({ reservationId: "dup-1" })),
      ).rejects.toBeInstanceOf(ConflictError);

      const rows = await db
        .select({ id: apiUsageLog.id })
        .from(apiUsageLog)
        .where(
          and(
            eq(apiUsageLog.service, AI_MODEL_SERVICE),
            eq(apiUsageLog.endpoint, "menu_match"),
          ),
        );
      expect(rows.map((r) => r.id)).toEqual([first.usageId]);
    });
  });

  /**
   * The restart case end to end: last month holds a row under the id this
   * call sends, which is exactly what a restarted counter produced. It must
   * not be a replay, and the call must count — here against a request cap of
   * one, so an uncounted allow would let the second call through too.
   */
  it("does not treat an earlier month's row as a replay, and counts the call", async () => {
    await withEnv({ AI_BUDGET_MAX_REQUESTS: "menu_match=1" }, () =>
      withTestDb(async (db) => {
        await db.insert(apiUsageLog).values({
          service: AI_MODEL_SERVICE,
          endpoint: "menu_match",
          estimatedCostCents: 0,
          metadata: { reservationId: "reused", nanoCents: 280_000_000 },
          createdAt: lastMonth(),
        });
        const actor = await activate(newBudgetActor(db));

        const first = await actor.reserveForModel(
          system,
          paid({ reservationId: "reused" }),
        );
        expect(first.allowed).toBe(true);
        expect(first.reason).not.toMatch(/already reserved/);
        expect(first.requestCount).toBe(0);

        const second = await actor.reserveForModel(system, paid());
        expect(second.allowed).toBe(false);
        expect(second.reason).toMatch(/1 of its 1 model calls/);
      }),
    );
  });

  it("refuses a reservation that does not name its model or provider", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      await expect(
        actor.reserveForModel(system, paid({ model: "  " })),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.reserveForModel(system, paid({ provider: "" })),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  /**
   * `parseModelPrices` is tested above as a pure function, and throws on a
   * typo so an operator's override is never silently ignored — but nothing
   * proved the override reaches a reservation at all. Reading it as `{}` at
   * activation, or not passing it to the pricing call, left the file green
   * (mutation audit, 2026-09-27): the exact silent-list-price outcome the
   * parser's own doc says it exists to prevent. Settlement re-prices with the
   * same table, so it is held to it too.
   */
  it("prices reservations and settlements with AI_MODEL_PRICES", async () => {
    const previous = process.env.AI_MODEL_PRICES;
    // 5 cents per 1000 tokens each way, against a list price of 0.28 cents
    // for the call `paid()` describes.
    process.env.AI_MODEL_PRICES = "gemini-2.5-flash=5000000000/5000000000";
    try {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        const reserved = await actor.reserveForModel(system, paid());
        expect(reserved.effectiveCostCents).toBe(10);

        await actor.settleForModel(system, {
          usageId: reserved.usageId ?? "",
          seam: "menu_match",
          provider: "vertex-ai",
          model: "gemini-2.5-flash",
          inputTokens: 500,
          outputTokens: 500,
        });
        const [row] = await db
          .select()
          .from(apiUsageLog)
          .where(eq(apiUsageLog.id, reserved.usageId ?? ""));
        expect(row?.estimatedCostCents).toBe(5);
      });
    } finally {
      if (previous === undefined) delete process.env.AI_MODEL_PRICES;
      else process.env.AI_MODEL_PRICES = previous;
    }
  });

  /**
   * A call inside a free tier books zero cents, and must record zero nanocents
   * to match — otherwise `floor(sum(nanoCents) / 1e9)` runs ahead of
   * `sum(cents)` and the first paid call after the tier is charged for the
   * free ones too. The model default has no free tier, so this is only
   * reachable through `setBudget`, and nothing exercised it.
   */
  it("does not let a free-tier call's price leak into the next paid one", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service: AI_MODEL_SERVICE, endpoint: "recipe_photo" },
        monthlyBudgetCents: 100_000,
        freeTierMonthlyRequests: 1,
        isEnabled: true,
      });
      // 50k in at 1.25e8/1k plus 50k out at 1e9/1k = 56.25 cents.
      const big = (reservationId: string) =>
        paid({
          seam: "recipe_photo",
          model: "gemini-2.5-pro",
          inputTokens: 50_000,
          outputTokens: 50_000,
          reservationId,
        });

      const free = await actor.reserveForModel(system, big("free-1"));
      expect(free.effectiveCostCents).toBe(0);
      const [row] = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, free.usageId ?? ""));
      expect(
        (row?.metadata as Record<string, unknown> | undefined)?.nanoCents,
      ).toBe(0);

      const charged = await actor.reserveForModel(system, big("paid-1"));
      expect(charged.effectiveCostCents).toBe(56);
    });
  });

  /**
   * The same property as the pure test above, through a real reservation and
   * the environment the actor host actually reads — and per seam, because the
   * provider has two endpoints and embeddings go to the second one.
   */
  it("charges openai-compatible by where each call goes, not by its name", async () => {
    const reserveBoth = async (env: Record<string, string>) =>
      // Empty is unset (`billing.ts`), so nothing from the shell leaks in.
      withEnv(
        {
          OPENAI_COMPAT_EMBEDDING_ENDPOINT: "",
          OPENAI_COMPAT_FREE: "",
          ...env,
        },
        () =>
          withTestDb(async (db) => {
            const actor = await activate(newBudgetActor(db));
            const compat = {
              provider: "openai-compatible",
              model: "gpt-4.1-mini",
            };
            // 50k tokens each way at the unknown-paid rate is ~110 cents, so a
            // paid reservation books whole cents on its own.
            const chat = await actor.reserveForModel(
              system,
              paid({
                ...compat,
                seam: "menu_match",
                inputTokens: 50_000,
                outputTokens: 50_000,
              }),
            );
            const embed = await actor.reserveForModel(
              system,
              paid({
                ...compat,
                seam: "embedding",
                inputTokens: 500_000,
                outputTokens: 0,
              }),
            );
            return [chat.effectiveCostCents, embed.effectiveCostCents];
          }),
      );

    expect(
      await reserveBoth({ OPENAI_COMPAT_ENDPOINT: "http://localhost:8000" }),
    ).toEqual([0, 0]);
    const [hostedChat, hostedEmbed] = await reserveBoth({
      OPENAI_COMPAT_ENDPOINT: "https://api.openai.com",
    });
    expect(hostedChat).toBeGreaterThan(0);
    expect(hostedEmbed).toBeGreaterThan(0);
    // Local chat, hosted embeddings: only the embedding seam pays.
    const [mixedChat, mixedEmbed] = await reserveBoth({
      OPENAI_COMPAT_ENDPOINT: "http://host.docker.internal:8000",
      OPENAI_COMPAT_EMBEDDING_ENDPOINT: "https://api.openai.com",
    });
    expect(mixedChat).toBe(0);
    expect(mixedEmbed).toBeGreaterThan(0);
    // And the operator's word beats the inference.
    expect(
      await reserveBoth({
        OPENAI_COMPAT_ENDPOINT: "https://vllm.example.com",
        OPENAI_COMPAT_FREE: "true",
      }),
    ).toEqual([0, 0]);
  });

  it("the cents cap binds once the carry reaches it", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service: AI_MODEL_SERVICE, endpoint: "menu_match" },
        monthlyBudgetCents: 1,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      let denied: string | null = null;
      for (let i = 0; i < 12 && denied === null; i += 1) {
        const result = await actor.reserveForModel(system, paid());
        if (!result.allowed) denied = result.reason;
      }
      expect(denied).toMatch(/monthly budget exhausted/);
    });
  });
});

describe.skipIf(skip)("BudgetActor.settleForModel (X1c)", () => {
  afterAll(closeTestDb);

  const reservation: ModelReserveInput = {
    seam: "recipe_photo",
    provider: "vertex-ai",
    model: "gemini-2.5-pro",
    inputTokens: 50_000,
    outputTokens: 50_000,
    reservationId: "settle-1",
  };

  it("replaces the estimate with the measurement and re-derives the cents", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const reserved = await actor.reserveForModel(system, reservation);
      // 50k in at 1.25e8/1k plus 50k out at 1e9/1k = 56.25 cents.
      expect(reserved.effectiveCostCents).toBe(56);

      await actor.settleForModel(system, {
        usageId: reserved.usageId ?? "",
        seam: "recipe_photo",
        provider: "vertex-ai",
        model: "gemini-2.5-pro",
        inputTokens: 5_000,
        outputTokens: 500,
      });

      const [row] = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, reserved.usageId ?? ""));
      // 5k in plus 500 out = 1.125 cents. The estimate was fifty times that.
      expect(row?.estimatedCostCents).toBe(1);
      const metadata = row?.metadata as Record<string, unknown>;
      expect(metadata.settled).toBe(true);
      expect(metadata.inputTokens).toBe(5_000);
      expect(metadata.nanoCents).toBe(1_125_000_000);
    });
  });

  it("refuses to settle a row that belongs to another endpoint", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const reserved = await actor.reserveForModel(system, reservation);
      await expect(
        actor.settleForModel(system, {
          usageId: reserved.usageId ?? "",
          seam: "menu_match",
          provider: "vertex-ai",
          model: "gemini-2.5-pro",
          inputTokens: 1,
          outputTokens: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  /**
   * BU-12 (mutation audit, reproduced before the fix). The guard meant to skip
   * free-tier rows was `metadata.nanoCents === undefined`, but `#reserve`
   * writes `nanoCents: 0` on every model row, free-tier included — so it never
   * fired, and settling a free-tier row re-priced it to its real cost. The
   * model default has no free tier; `setBudget` can give it one.
   */
  it("does not re-price a free-tier row when it settles", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      await actor.setBudget(admin, {
        kind: { service: AI_MODEL_SERVICE, endpoint: "recipe_photo" },
        monthlyBudgetCents: 100_000,
        freeTierMonthlyRequests: 1,
        isEnabled: true,
      });
      const free = await actor.reserveForModel(system, {
        ...reservation,
        reservationId: "free-then-settled",
      });
      expect(free.effectiveCostCents).toBe(0);

      await actor.settleForModel(system, {
        usageId: free.usageId ?? "",
        seam: "recipe_photo",
        provider: "vertex-ai",
        model: "gemini-2.5-pro",
        inputTokens: 50_000,
        outputTokens: 50_000,
      });
      const [row] = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, free.usageId ?? ""));
      expect(row?.estimatedCostCents).toBe(0);
      expect(
        (row?.metadata as Record<string, unknown> | undefined)?.nanoCents,
      ).toBe(0);

      // And the free call's price does not leak into the next paid one.
      const charged = await actor.reserveForModel(system, {
        ...reservation,
        reservationId: "paid-after-free",
      });
      expect(charged.effectiveCostCents).toBe(56);
    });
  });

  /**
   * A call reserved in a month's last moments and settled after midnight is
   * last month's spend. Settlement re-derives the row's cents from the carry
   * of *its* month; it used to use the settling instant's month, so the row
   * was re-priced against a ledger it is not part of.
   */
  it("settles a row against the month it was reserved in", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const insert = async (
        reservationId: string,
        nanoCents: number,
        cents: number,
        createdAt: Date,
      ) =>
        (
          await db
            .insert(apiUsageLog)
            .values({
              service: AI_MODEL_SERVICE,
              endpoint: "recipe_photo",
              estimatedCostCents: cents,
              metadata: { reservationId, nanoCents },
              createdAt,
            })
            .returning({ id: apiUsageLog.id })
        )[0]?.id ?? "";
      // Last month: 0.9 cents, then the reservation (56.25 → books 57).
      await insert("late-a", 900_000_000, 0, lastMonth());
      const late = await insert("late-r", 56_250_000_000, 57, lastMonth());
      // This month: 0.3 cents so far.
      await insert("now-s", 300_000_000, 0, new Date());

      // 5k in + 500 out on 2.5-pro = 1.125 cents.
      await actor.settleForModel(system, {
        usageId: late,
        seam: "recipe_photo",
        provider: "vertex-ai",
        model: "gemini-2.5-pro",
        inputTokens: 5_000,
        outputTokens: 500,
      });
      const [row] = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, late));
      // Against its own month: floor(0.9 + 1.125) - 0 = 2. Against this
      // month's ledger it came out as 1, and last month's books no longer
      // matched floor(sum(nanoCents)).
      expect(row?.estimatedCostCents).toBe(2);
    });
  });

  /**
   * What the carry actually guarantees, which is less than its doc used to
   * say. Booked cents never fall *below* the exact total floored — the
   * direction a budget must not err in — but a settlement cannot take cents
   * back from a row that booked none, so settle-downs of such rows leave the
   * ledger above the exact total, and interleaved ones accumulate past one
   * cent. Later calls absorb the excess: they book nothing until the exact
   * total catches up.
   */
  it("never under-books after settle-downs, may over-book by more than a cent, and absorbs it", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const cheap: ModelReserveInput = {
        seam: "menu_match",
        provider: "vertex-ai",
        model: "gemini-2.5-pro",
        // 0.5 cents: 4000 in at 1.25e8/1k.
        inputTokens: 4_000,
        outputTokens: 0,
        reservationId: "",
      };
      const dear = { ...cheap, inputTokens: 4_800 }; // 0.6 cents
      const settleToZero: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await actor.reserveForModel(system, {
          ...cheap,
          reservationId: `cheap-${i}`,
        });
        expect(r.effectiveCostCents).toBe(0);
        settleToZero.push(r.usageId ?? "");
        const s = await actor.reserveForModel(system, {
          ...dear,
          reservationId: `dear-${i}`,
        });
        expect(s.effectiveCostCents).toBe(1);
      }
      for (const usageId of settleToZero) {
        await actor.settleForModel(system, {
          usageId,
          seam: "menu_match",
          provider: "vertex-ai",
          model: "gemini-2.5-pro",
          inputTokens: 0,
          outputTokens: 0,
        });
      }
      const ledger = async () => {
        const rows = await db
          .select()
          .from(apiUsageLog)
          .where(eq(apiUsageLog.endpoint, "menu_match"));
        return {
          cents: rows.reduce((sum, r) => sum + r.estimatedCostCents, 0),
          floor: Math.floor(
            rows.reduce(
              (sum, r) =>
                sum +
                Number((r.metadata as Record<string, unknown>).nanoCents ?? 0),
              0,
            ) / NANOCENTS_PER_CENT,
          ),
        };
      };
      // Exact total 1.8 cents; booked 3.
      expect(await ledger()).toEqual({ cents: 3, floor: 1 });

      // The next 0.6-cent call books nothing: the ledger is already ahead.
      const next = await actor.reserveForModel(system, {
        ...dear,
        reservationId: "dear-next",
      });
      expect(next.effectiveCostCents).toBe(0);
      const after = await ledger();
      expect(after.cents).toBeGreaterThanOrEqual(after.floor);
    });
  });

  it("keeps sum(cents) equal to floor(sum(nanoCents)) after a settlement", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newBudgetActor(db));
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const r = await actor.reserveForModel(system, {
          ...reservation,
          reservationId: `mix-${i}`,
        });
        ids.push(r.usageId ?? "");
      }
      await actor.settleForModel(system, {
        usageId: ids[2] ?? "",
        seam: "recipe_photo",
        provider: "vertex-ai",
        model: "gemini-2.5-pro",
        inputTokens: 1_000,
        outputTokens: 100,
      });

      const rows = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.endpoint, "recipe_photo"));
      const cents = rows.reduce((sum, r) => sum + r.estimatedCostCents, 0);
      const nano = rows.reduce(
        (sum, r) =>
          sum + Number((r.metadata as Record<string, unknown>).nanoCents ?? 0),
        0,
      );
      // The clamp at zero can leave the booked cents up to a cent above the
      // exact total (see `settleForModel`); it may never be below it.
      expect(cents).toBeGreaterThanOrEqual(
        Math.floor(nano / NANOCENTS_PER_CENT),
      );
      expect(cents).toBeLessThanOrEqual(
        Math.floor(nano / NANOCENTS_PER_CENT) + 1,
      );
    });
  });
});

/*
 * W4 security F4: nothing capped one signed-in account, so one user could
 * spend a whole seam's month. The global caps still bound the bill; these hold
 * each account to its own hourly and daily share.
 */
describe("per-user caps: parsing (W4 security F4)", () => {
  it("parses service/endpoint=hourly/daily and refuses anything that could not bind", () => {
    expect(
      parseUserCaps("ai_model/embedding=600/4000, google_places/photo=5/5"),
    ).toEqual({
      "ai_model/embedding": { hourly: 600, daily: 4000 },
      "google_places/photo": { hourly: 5, daily: 5 },
    });
    expect(parseUserCaps("")).toEqual({});
    for (const bad of [
      "embedding=5/10",
      "ai_model/embedding=5",
      "ai_model/embedding=0/10",
      "ai_model/embedding=10/5",
      "ai_model/embedding=lots/10",
    ]) {
      expect(() => parseUserCaps(bad), bad).toThrow(ValidationError);
    }
  });

  it("SV-A: parses an optional period cap and one period= entry", () => {
    expect(
      parseUserCapConfig(
        "ai_model/tier_list_insights=30/150/40, period=week, ai_model/embedding=1/2",
      ),
    ).toEqual({
      caps: {
        "ai_model/tier_list_insights": { hourly: 30, daily: 150, period: 40 },
        "ai_model/embedding": { hourly: 1, daily: 2 },
      },
      period: "week",
      placesMonthly: null,
    });
    expect(parseUserCapConfig("period=month").period).toBe("month");
    expect(parseUserCapConfig(undefined)).toEqual({
      caps: {},
      period: null,
      placesMonthly: null,
    });
    for (const bad of [
      "period=day",
      "period=month,period=week",
      "ai_model/embedding=1/2/0",
      "ai_model/embedding=1/2/lots",
      "ai_model/embedding=1/2/3/4",
    ]) {
      expect(() => parseUserCapConfig(bad), bad).toThrow(ValidationError);
    }
  });

  it("F-230: parses google_places=<monthly> and refuses a period on a Places kind", () => {
    expect(readModelBudgetPolicy({}).googlePlacesUserMonthlyCalls).toBe(
      DEFAULT_GOOGLE_PLACES_USER_MONTHLY_CALLS,
    );
    expect(
      readModelBudgetPolicy({ BUDGET_USER_CAPS: "google_places=40" })
        .googlePlacesUserMonthlyCalls,
    ).toBe(40);
    for (const bad of [
      "google_places=0",
      "google_places=lots",
      "google_places=1,google_places=2",
      "google_places/autocomplete=1/2/3",
    ]) {
      expect(() => parseUserCapConfig(bad), bad).toThrow(ValidationError);
    }
  });

  it("SV-A (L5): defaults to a UTC calendar month and ten days' worth per kind", () => {
    const policy = readModelBudgetPolicy({});
    expect(policy.userCapPeriod).toBe("month");
    expect(periodLimit({ hourly: 30, daily: 150 })).toBe(1_500);
    expect(periodLimit({ hourly: 30, daily: 150, period: 7 })).toBe(7);
    expect(
      readModelBudgetPolicy({ BUDGET_USER_CAPS: "period=week" }).userCapPeriod,
    ).toBe("week");
  });

  it("layers BUDGET_USER_CAPS over the defaults, and a malformed one stops the boot", () => {
    const policy = readModelBudgetPolicy({
      BUDGET_USER_CAPS: "ai_model/embedding=1/2",
    });
    expect(policy.userCaps["ai_model/embedding"]).toEqual({
      hourly: 1,
      daily: 2,
    });
    expect(policy.userCaps["ai_model/menu_match"]).toEqual(
      USER_CAPS["ai_model/menu_match"],
    );
    expect(() =>
      readModelBudgetPolicy({ BUDGET_USER_CAPS: "nonsense" }),
    ).toThrow(ValidationError);
  });

  it("names every model seam, so none falls to the catch-all by accident", () => {
    for (const seam of Object.keys(MODEL_SPENDERS)) {
      expect(USER_CAPS[`${AI_MODEL_SERVICE}/${seam}`], seam).toBeDefined();
    }
  });
});

describe.skipIf(skip)("per-user caps: enforcement (W4 security F4)", () => {
  afterAll(closeTestDb);

  const OTHER = "33333333-3333-4333-8333-333333333333";
  const other = userCtx(OTHER, "r-other");
  const matchCall = (): ModelReserveInput => ({
    seam: "menu_match",
    provider: "vertex-ai",
    model: "gemini-2.5-flash",
    inputTokens: 10,
    outputTokens: 10,
    reservationId: `cap-${crypto.randomUUID()}`,
  });

  const rowsFor = async (db: DbOrTx, userId: string): Promise<number> =>
    (
      await db
        .select({ id: apiUsageLog.id })
        .from(apiUsageLog)
        .where(
          and(
            eq(apiUsageLog.triggeredBy, userId),
            eq(apiUsageLog.endpoint, "menu_match"),
          ),
        )
    ).length;

  it("refuses a user's call past the hourly cap, writes nothing for it, and leaves other users alone", async () => {
    await withTestDb(async (db) => {
      const actor = await withEnv(
        { BUDGET_USER_CAPS: "ai_model/menu_match=2/10" },
        () => reactivate(db),
      );
      const before = await rowsFor(db, USER);
      const results = [];
      for (let i = 0; i < 3; i += 1) {
        results.push(await actor.reserveForModel(user, matchCall()));
      }
      expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
      expect(results[2]?.reason).toMatch(
        new RegExp(`^${USER_CAP_REASON}: .*2 of its 2 calls in the last hour`),
      );
      expect(await rowsFor(db, USER)).toBe(before + 2);
      // Another account's share is its own.
      expect((await actor.reserveForModel(other, matchCall())).allowed).toBe(
        true,
      );
    });
  });

  it("counts the last 24 hours against the daily cap once the hour has rolled", async () => {
    await withTestDb(async (db) => {
      const actor = await withEnv(
        { BUDGET_USER_CAPS: "ai_model/menu_match=2/3" },
        () => reactivate(db),
      );
      await actor.reserveForModel(user, matchCall());
      await actor.reserveForModel(user, matchCall());
      // Two hours ago: out of the hourly window, inside the daily one.
      await db
        .update(apiUsageLog)
        .set({ createdAt: sql`now() - interval '2 hours'` })
        .where(eq(apiUsageLog.triggeredBy, USER));
      expect((await actor.reserveForModel(user, matchCall())).allowed).toBe(
        true,
      );
      const refused = await actor.reserveForModel(user, matchCall());
      expect(refused.allowed).toBe(false);
      expect(refused.reason).toMatch(/3 of its 3 calls in the last 24 hours/);
    });
  });

  it("counts a delivery's spend against whoever enqueued it — reserve as well as reserveForModel", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      // `setBudget` reloads the aggregate, which re-reads the environment —
      // so configure first, then activate under the override.
      await (await activate(newBudgetActor(db))).setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 1000,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const actor = await withEnv(
        { BUDGET_USER_CAPS: `${service}/call=1/1` },
        () => reactivate(db),
      );
      const target = OUTBOX_TARGETS["MenuScanActor.process"];
      const delivery = {
        targetId: "00000000-0000-4000-8000-00000000000b",
        payload: { menuScanId: "00000000-0000-4000-8000-00000000000b" },
      };
      const attributed = await enqueueOutbox(db, target, delivery, {
        attributeTo: user,
      });
      const input = {
        kind: { service, endpoint: "call" },
        estimatedCostCents: 1,
      };

      const first = await actor.reserve(deliveryCtx(attributed), call(input));
      expect(first.allowed).toBe(true);
      const [row] = await db
        .select({ triggeredBy: apiUsageLog.triggeredBy })
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, first.usageId ?? ""));
      expect(row?.triggeredBy).toBe(USER);

      // The user's share of this kind is spent, through the outbox.
      const second = await actor.reserve(deliveryCtx(attributed), call(input));
      expect(second.allowed).toBe(false);
      expect(second.reason).toMatch(new RegExp(`^${USER_CAP_REASON}`));

      // Work nobody's request caused has no user, and no per-user cap.
      expect((await actor.reserve(system, call(input))).allowed).toBe(true);
      expect((await actor.reserve(system, call(input))).allowed).toBe(true);
    });
  });

  it("does not count a replayed reservation twice", async () => {
    await withTestDb(async (db) => {
      const service = fixtureService();
      // `setBudget` reloads the aggregate, which re-reads the environment —
      // so configure first, then activate under the override.
      await (await activate(newBudgetActor(db))).setBudget(admin, {
        kind: { service, endpoint: "call" },
        monthlyBudgetCents: 1000,
        freeTierMonthlyRequests: 0,
        isEnabled: true,
      });
      const actor = await withEnv(
        { BUDGET_USER_CAPS: `${service}/call=1/1` },
        () => reactivate(db),
      );
      const once = {
        ...call({ kind: { service, endpoint: "call" }, estimatedCostCents: 1 }),
        triggeredBy: USER,
      };
      expect((await actor.reserve(system, once)).allowed).toBe(true);
      const replay = await actor.reserve(system, once);
      expect(replay.allowed).toBe(true);
      expect(replay.reason).toMatch(/already reserved/);
    });
  });
});

/**
 * SV-A (L5): the period cap beside the rolling windows, and MC-quota's
 * `myQuota` — the viewer's own allowance, never anybody else's.
 */
describe.skipIf(skip)("per-user period cap and myQuota (SV-A)", () => {
  afterAll(closeTestDb);

  const OTHER = "44444444-4444-4444-8444-444444444444";
  const other = userCtx(OTHER, "r-other-quota");
  const matchCall = (): ModelReserveInput => ({
    seam: "menu_match",
    provider: "vertex-ai",
    model: "gemini-2.5-flash",
    inputTokens: 10,
    outputTokens: 10,
    reservationId: `period-${crypto.randomUUID()}`,
  });
  const quotaFor = async (actor: BudgetActor, ctx: typeof user) => {
    const page = await actor.myQuota(ctx, pageArgs({ first: 50 }));
    return page.entries.find((e) => e.node.kind === "ai_model/menu_match")
      ?.node;
  };

  it("refuses at the period cap with retryAt at the next period start, and counts nobody else's calls", async () => {
    await withTestDb(async (db) => {
      const actor = await withEnv(
        { BUDGET_USER_CAPS: "ai_model/menu_match=10/10/2" },
        () => reactivate(db),
      );
      expect((await actor.reserveForModel(user, matchCall())).allowed).toBe(
        true,
      );
      expect((await actor.reserveForModel(user, matchCall())).allowed).toBe(
        true,
      );
      const refused = await actor.reserveForModel(user, matchCall());
      expect(refused.allowed).toBe(false);
      expect(refused.refusal).toBe("USER_CAP");
      expect(refused.reason).toMatch(
        new RegExp(`^${USER_CAP_REASON}: .*2 of its 2 calls this month`),
      );
      expect(refused.retryAt).toBe(nextMonthStart().toISOString());
      // Another account's period is its own.
      expect((await actor.reserveForModel(other, matchCall())).allowed).toBe(
        true,
      );
    });
  });

  it("lets the person through once a new period starts", async () => {
    await withTestDb(async (db) => {
      const actor = await withEnv(
        { BUDGET_USER_CAPS: "ai_model/menu_match=10/10/2" },
        () => reactivate(db),
      );
      await actor.reserveForModel(user, matchCall());
      await actor.reserveForModel(user, matchCall());
      expect((await actor.reserveForModel(user, matchCall())).allowed).toBe(
        false,
      );
      // Both calls belong to the previous period now.
      await db
        .update(apiUsageLog)
        .set({
          createdAt: sql`(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') - interval '1 minute'`,
        })
        .where(eq(apiUsageLog.triggeredBy, USER));
      expect((await actor.reserveForModel(user, matchCall())).allowed).toBe(
        true,
      );
    });
  });

  it("names a Monday reset for period=week", async () => {
    await withTestDb(async (db) => {
      const actor = await withEnv(
        { BUDGET_USER_CAPS: "period=week,ai_model/menu_match=10/10/1" },
        () => reactivate(db),
      );
      await actor.reserveForModel(user, matchCall());
      const refused = await actor.reserveForModel(user, matchCall());
      expect(refused.allowed).toBe(false);
      const reset = new Date(refused.retryAt ?? "");
      expect(reset.getUTCDay()).toBe(1);
      expect(reset.getUTCHours()).toBe(0);
      const days = (reset.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(7);
      expect(refused.reason).toMatch(/this week/);
    });
  });

  it("myQuota reads only the viewer's own usage", async () => {
    await withTestDb(async (db) => {
      const actor = await withEnv(
        { BUDGET_USER_CAPS: "ai_model/menu_match=10/10/5" },
        () => reactivate(db),
      );
      const userBefore = (await quotaFor(actor, user))?.used ?? 0;
      const otherBefore = (await quotaFor(actor, other))?.used ?? 0;
      await actor.reserveForModel(user, matchCall());
      await actor.reserveForModel(user, matchCall());
      await actor.reserveForModel(other, matchCall());

      const mine = await quotaFor(actor, user);
      expect(mine).toEqual({
        kind: "ai_model/menu_match",
        used: userBefore + 2,
        limit: 5,
        resetsAt: nextMonthStart().toISOString(),
      });
      expect((await quotaFor(actor, other))?.used).toBe(otherBefore + 1);

      // Every model seam is listed, each with its own limit, then (F-230)
      // Google Places' one allowance.
      const all = await actor.myQuota(user, pageArgs({ first: 50 }));
      expect(all.entries.map((e) => e.node.kind)).toEqual([
        ...MODEL_SEAMS.map((seam) => `${AI_MODEL_SERVICE}/${seam}`),
        GOOGLE_PLACES_BUDGET_SERVICE,
      ]);
      expect(
        all.entries.find((e) => e.node.kind === "ai_model/tier_list_insights")
          ?.node.limit,
      ).toBe(
        periodLimit(
          USER_CAPS["ai_model/tier_list_insights"] ?? { hourly: 0, daily: 0 },
        ),
      );
    });
  });

  /*
   * F-230 (FR-16): Google Places has its own monthly allowance per person,
   * one count across every Places endpoint, separate from every AI kind —
   * and `myQuota` shows it, so a Places refusal always has a visible reason.
   */
  const placesKinds = [
    { service: "google_places", endpoint: "autocomplete" },
    { service: "google_places", endpoint: "nearby_search" },
  ] as const;
  /** Config rows first: `setBudget` reloads, which re-reads the env. */
  const openPlaces = async (db: DbOrTx) => {
    const actor = await reactivate(db);
    for (const kind of placesKinds) {
      await actor.setBudget(admin, {
        kind,
        monthlyBudgetCents: 100_000,
        freeTierMonthlyRequests: 100_000,
        isEnabled: true,
      });
    }
  };
  const placesCall =
    (ctx: typeof user, endpoint: 0 | 1) => async (actor: BudgetActor) =>
      actor.reserveForSearch(ctx, {
        kind: placesKinds[endpoint],
        estimatedCostCents: 0,
        reservationId: `places-${crypto.randomUUID()}`,
      });

  it("F-230: Places is one monthly allowance across its endpoints, apart from AI", async () => {
    await withTestDb(async (db) => {
      await openPlaces(db);
      const actor = await withEnv(
        {
          BUDGET_USER_CAPS:
            "google_places=3, ai_model/menu_match=10/10/10, period=week",
        },
        () => reactivate(db),
      );
      expect((await placesCall(user, 0)(actor)).allowed).toBe(true);
      expect((await placesCall(user, 1)(actor)).allowed).toBe(true);
      expect((await placesCall(user, 0)(actor)).allowed).toBe(true);
      const refused = await placesCall(user, 1)(actor);
      expect(refused.allowed).toBe(false);
      expect(refused.refusal).toBe("USER_CAP");
      expect(refused.reason).toMatch(
        new RegExp(
          `^${USER_CAP_REASON}: .*3 of its 3 Google Places calls this month`,
        ),
      );
      // Monthly whatever the AI period is.
      expect(refused.retryAt).toBe(nextMonthStart().toISOString());
      // Spending Places leaves AI alone, and another person's month is theirs.
      expect((await actor.reserveForModel(user, matchCall())).allowed).toBe(
        true,
      );
      expect((await placesCall(other, 0)(actor)).allowed).toBe(true);

      const page = await actor.myQuota(user, pageArgs({ first: 50 }));
      expect(
        page.entries.find((e) => e.node.kind === GOOGLE_PLACES_BUDGET_SERVICE)
          ?.node,
      ).toEqual({
        kind: GOOGLE_PLACES_BUDGET_SERVICE,
        used: 3,
        limit: 3,
        resetsAt: nextMonthStart().toISOString(),
      });
      // The AI rows still count the AI period (a week here), not Places'.
      expect(
        page.entries.find((e) => e.node.kind === "ai_model/menu_match")?.node
          .used,
      ).toBe(1);
    });
  });

  it("F-230: a Places endpoint's own ten-days period no longer binds", async () => {
    await withTestDb(async (db) => {
      // 1/1 a day would be a period of ten under the old per-kind rule; the
      // pooled allowance (5) is what binds now, and the rolling day is lifted
      // here so only the month is in play.
      await openPlaces(db);
      const actor = await withEnv(
        {
          BUDGET_USER_CAPS: "google_places/autocomplete=50/50, google_places=5",
        },
        () => reactivate(db),
      );
      for (let i = 0; i < 5; i += 1) {
        expect((await placesCall(user, 0)(actor)).allowed, `call ${i}`).toBe(
          true,
        );
      }
      expect((await placesCall(user, 0)(actor)).allowed).toBe(false);
    });
  });

  it("myQuota refuses a caller with no viewer", async () => {
    await withTestDb(async (db) => {
      const actor = await reactivate(db);
      await expect(
        actor.myQuota(anonymous, pageArgs({ first: 10 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.myQuota(system, pageArgs({ first: 10 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

/**
 * Wave 6: the caps no longer depend on the singleton key.
 *
 * Two activations of `BudgetActor("singleton")` running at once is what a
 * Dapr placement split during a rolling deploy produces, and it is the one
 * thing the key cannot prevent. Each attempt below is its own activation in
 * its own real top-level transaction; `beforeCommit` holds each open after its
 * reserve until the other has reserved too (or `HOLD_MS` passes). Without the
 * per-kind lock both count the same committed rows and both are allowed; with
 * it the second waits on the lock for the first to commit, and counts its row.
 */
describe.skipIf(skip)(
  "BudgetActor: per-kind lock under a placement split (Wave 6)",
  () => {
    afterAll(closeTestDb);

    const HOLD_MS = 750;

    const rendezvous = (n: number, timeoutMs: number) => {
      let arrived = 0;
      let release: () => void = () => {};
      const all = new Promise<void>((resolve) => {
        release = resolve;
      });
      return async (): Promise<void> => {
        arrived += 1;
        if (arrived === n) release();
        await Promise.race([
          all,
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      };
    };

    /** Two activations reserve the fixture kind at once; one slot is left. */
    const raceTwoActivations = async (options: {
      readonly freeTier: number;
      readonly budgetCents: number;
      readonly perUserCap?: boolean;
    }) => {
      const service = fixtureService();
      const kind = { service, endpoint: "call" };
      const setup = await activate(newBudgetActor(testDb()));
      await setup.setBudget(admin, {
        kind,
        monthlyBudgetCents: options.budgetCents,
        freeTierMonthlyRequests: options.freeTier,
        isEnabled: true,
      });
      const beforeCommit = rendezvous(2, HOLD_MS);
      const attempt = () =>
        testDb().transaction(async (tx) => {
          const actor = await activate(newBudgetActor(tx));
          const result = await actor.reserve(
            system,
            call({ kind, estimatedCostCents: 1, triggeredBy: USER }),
          );
          await beforeCommit();
          return result;
        });
      try {
        // Caps are read from the environment at activation, so the whole race
        // runs inside it.
        const results = await withEnv(
          options.perUserCap === true
            ? { BUDGET_USER_CAPS: `${service}/call=1/5` }
            : {},
          () => Promise.all([attempt(), attempt()]),
        );
        const rows = await testDb()
          .select({ id: apiUsageLog.id })
          .from(apiUsageLog)
          .where(eq(apiUsageLog.service, service));
        return { results, rows };
      } finally {
        await testDb()
          .delete(apiUsageLog)
          .where(eq(apiUsageLog.service, service));
        await testDb().execute(
          sql`delete from api_budget_config where service = ${service}`,
        );
      }
    };

    it("the last free-tier request is granted exactly once when two activations reserve it at the same moment", async () => {
      const { results, rows } = await raceTwoActivations({
        freeTier: 1,
        budgetCents: 0,
      });
      expect(results.map((r) => r.allowed).sort()).toEqual([false, true]);
      expect(rows).toHaveLength(1);
    }, 30_000);

    it("a user's last per-user slot is granted exactly once across two activations", async () => {
      const { results, rows } = await raceTwoActivations({
        freeTier: 1_000,
        budgetCents: 1_000,
        perUserCap: true,
      });
      expect(results.map((r) => r.allowed).sort()).toEqual([false, true]);
      expect(
        results.find((r) => !r.allowed)?.reason.startsWith(USER_CAP_REASON),
      ).toBe(true);
      expect(rows).toHaveLength(1);
    }, 30_000);
  },
);

/*
 * N07 / D17: a refusal says whose limit it was and when it clears, and a
 * reservation whose call got no model response stops counting.
 */
describe.skipIf(skip)(
  "typed refusals and released reservations (N07, D17)",
  () => {
    afterAll(closeTestDb);

    const call = (
      over: Partial<ModelReserveInput> = {},
    ): ModelReserveInput => ({
      seam: "menu_match",
      provider: "vertex-ai",
      model: "gemini-2.5-flash",
      inputTokens: 1000,
      outputTokens: 1000,
      reservationId: `n07-${crypto.randomUUID()}`,
      ...over,
    });

    const rowOf = async (db: DbOrTx, id: string | null) => {
      const [row] = await db
        .select()
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, id ?? ""));
      return row;
    };

    it("nextMonthStart is the first instant of the following UTC month", () => {
      expect(
        nextMonthStart(new Date("2026-12-31T23:59:59.999Z")).toISOString(),
      ).toBe("2027-01-01T00:00:00.000Z");
      expect(
        nextMonthStart(new Date("2026-10-07T12:00:00.000Z")).toISOString(),
      ).toBe("2026-11-01T00:00:00.000Z");
    });

    it("a per-user refusal is USER_CAP, with when the window frees a slot", async () => {
      await withTestDb(async (db) => {
        const actor = await withEnv(
          { BUDGET_USER_CAPS: "ai_model/menu_match=2/10" },
          () => reactivate(db),
        );
        const first = await actor.reserveForModel(user, call());
        await actor.reserveForModel(user, call());
        const refused = await actor.reserveForModel(user, call());
        expect(refused.allowed).toBe(false);
        expect(refused.refusal).toBe("USER_CAP");

        // The oldest of the two rows in the hour rolls off an hour after it
        // was written; that is when the third call fits.
        const oldest = await rowOf(db, first.usageId);
        expect(Date.parse(refused.retryAt ?? "")).toBe(
          (oldest?.createdAt?.getTime() ?? 0) + 3_600_000,
        );

        // `reserveForModel` itself never throws for a denial; the seam does,
        // and an allow carries no refusal.
        expect(first.refusal ?? null).toBeNull();
      });
    });

    it("when the hour and the day are both full, retryAt waits for the day", async () => {
      await withTestDb(async (db) => {
        const actor = await withEnv(
          { BUDGET_USER_CAPS: "ai_model/menu_match=2/2" },
          () => reactivate(db),
        );
        const first = await actor.reserveForModel(user, call());
        await actor.reserveForModel(user, call());
        const refused = await actor.reserveForModel(user, call());
        expect(refused.refusal).toBe("USER_CAP");
        // The hour frees a slot an hour after the oldest row, but the day is
        // still full then: the call fits only a day after it.
        const oldest = await rowOf(db, first.usageId);
        expect(Date.parse(refused.retryAt ?? "")).toBe(
          (oldest?.createdAt?.getTime() ?? 0) + 86_400_000,
        );
      });
    });

    it("a monthly request cap is SERVICE_BUDGET, clearing when the month turns", async () => {
      await withEnv({ AI_BUDGET_MAX_REQUESTS: "menu_match=1" }, async () => {
        await withTestDb(async (db) => {
          const actor = await activate(newBudgetActor(db));
          await actor.reserveForModel(system, call());
          const refused = await actor.reserveForModel(system, call());
          expect(refused.allowed).toBe(false);
          expect(refused.refusal).toBe("SERVICE_BUDGET");
          expect(refused.retryAt).toBe(nextMonthStart().toISOString());
        });
      });
    });

    it("a disabled kind is SERVICE_BUDGET with no time that clears it", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        await actor.setBudget(admin, {
          kind: { service: AI_MODEL_SERVICE, endpoint: "menu_match" },
          monthlyBudgetCents: 100,
          freeTierMonthlyRequests: 0,
          isEnabled: false,
        });
        const refused = await actor.reserveForModel(system, call());
        expect(refused).toMatchObject({
          allowed: false,
          refusal: "SERVICE_BUDGET",
          retryAt: null,
        });
      });
    });

    it("reserveOrThrow carries the refusal onto BudgetExceededError", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        const error = await actor
          .reserveOrThrow(system, {
            kind: { service: fixtureService(), endpoint: "call" },
            estimatedCostCents: 1,
            reservationId: key(),
          })
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(BudgetExceededError);
        expect(error).toMatchObject({
          reason: "SERVICE_BUDGET",
          retryAt: null,
        });
      });
    });

    it("a released reservation stops counting against the request cap", async () => {
      await withEnv({ AI_BUDGET_MAX_REQUESTS: "menu_match=1" }, async () => {
        await withTestDb(async (db) => {
          const actor = await activate(newBudgetActor(db));
          const unanswered = await actor.reserveForModel(system, call());
          expect(unanswered.allowed).toBe(true);
          await actor.releaseForModel(system, {
            usageId: unanswered.usageId ?? "",
            seam: "menu_match",
          });
          // The retry is free: the cap of one has not been used.
          expect((await actor.reserveForModel(system, call())).allowed).toBe(
            true,
          );
          expect((await actor.reserveForModel(system, call())).allowed).toBe(
            false,
          );

          const row = await rowOf(db, unanswered.usageId);
          expect(
            (row?.metadata as Record<string, unknown> | undefined)?.released,
          ).toBe(true);
          const usage = await actor.usage(admin, {
            from: monthStart().toISOString(),
            to: new Date(Date.now() + 86_400_000).toISOString(),
            service: AI_MODEL_SERVICE,
            endpoint: "menu_match",
          });
          expect(usage.totalRequestCount).toBe(1);
        });
      });
    });

    it("a released reservation gives the caller's per-user slot back", async () => {
      await withTestDb(async (db) => {
        const actor = await withEnv(
          { BUDGET_USER_CAPS: "ai_model/menu_match=1/10" },
          () => reactivate(db),
        );
        const unanswered = await actor.reserveForModel(user, call());
        await actor.releaseForModel(user, {
          usageId: unanswered.usageId ?? "",
          seam: "menu_match",
        });
        expect((await actor.reserveForModel(user, call())).allowed).toBe(true);
        expect((await actor.reserveForModel(user, call())).refusal).toBe(
          "USER_CAP",
        );
      });
    });

    it("re-derives a released paid row's cents so the carry never under-books", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        // 0.28 cents each (see "carries sub-cent prices"): the fourth books the
        // cent all four crossed. Releasing that fourth one leaves 0.84 cents of
        // real calls, so the month's booked cents may drop to zero — and must
        // never drop below floor(sum(nanoCents) / 1e9).
        const reserved = [];
        for (let i = 0; i < 4; i += 1) {
          reserved.push(await actor.reserveForModel(system, call()));
        }
        expect(reserved.map((r) => r.effectiveCostCents)).toEqual([0, 0, 0, 1]);
        await actor.releaseForModel(system, {
          usageId: reserved[3]?.usageId ?? "",
          seam: "menu_match",
        });
        const [totals] = await db
          .select({
            cents: sql<string>`sum(${apiUsageLog.estimatedCostCents})`,
            nano: sql<string>`sum((${apiUsageLog.metadata} ->> 'nanoCents')::numeric)`,
          })
          .from(apiUsageLog)
          .where(
            and(
              eq(apiUsageLog.service, AI_MODEL_SERVICE),
              eq(apiUsageLog.endpoint, "menu_match"),
            ),
          );
        expect(Number(totals?.cents)).toBeGreaterThanOrEqual(
          Math.floor(Number(totals?.nano) / NANOCENTS_PER_CENT),
        );
        expect(Number(totals?.nano)).toBe(3 * 280_000_000);
      });
    });

    it("keepCost gives back the allowance but leaves the money booked", async () => {
      await withEnv({ AI_BUDGET_MAX_REQUESTS: "menu_match=4" }, async () => {
        await withTestDb(async (db) => {
          const actor = await activate(newBudgetActor(db));
          const reserved = [];
          for (let i = 0; i < 4; i += 1) {
            reserved.push(await actor.reserveForModel(system, call()));
          }
          // A timeout: the provider may have run (and billed) it.
          await actor.releaseForModel(system, {
            usageId: reserved[3]?.usageId ?? "",
            seam: "menu_match",
            keepCost: true,
          });
          const row = await rowOf(db, reserved[3]?.usageId ?? null);
          expect(row?.metadata).toMatchObject({
            released: true,
            nanoCents: 280_000_000,
          });
          expect(row?.estimatedCostCents).toBe(1);
          // The request cap of four has a slot again.
          expect((await actor.reserveForModel(system, call())).allowed).toBe(
            true,
          );
          expect((await actor.reserveForModel(system, call())).allowed).toBe(
            false,
          );
        });
      });
    });

    it("is idempotent, and never releases a call that was settled", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        const answered = await actor.reserveForModel(system, call());
        await actor.settleForModel(system, {
          usageId: answered.usageId ?? "",
          seam: "menu_match",
          provider: "vertex-ai",
          model: "gemini-2.5-flash",
          inputTokens: 10,
          outputTokens: 10,
        });
        await actor.releaseForModel(system, {
          usageId: answered.usageId ?? "",
          seam: "menu_match",
        });
        const settled = await rowOf(db, answered.usageId);
        expect(
          (settled?.metadata as Record<string, unknown> | undefined)?.released,
        ).toBeUndefined();

        const unanswered = await actor.reserveForModel(system, call());
        const release = () =>
          actor.releaseForModel(system, {
            usageId: unanswered.usageId ?? "",
            seam: "menu_match",
          });
        await release();
        await release();
        const released = await rowOf(db, unanswered.usageId);
        expect(
          (released?.metadata as Record<string, unknown> | undefined)?.released,
        ).toBe(true);
      });
    });

    it("refuses another endpoint's row, a missing row and a non-seam", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newBudgetActor(db));
        const reserved = await actor.reserveForModel(system, call());
        await expect(
          actor.releaseForModel(system, {
            usageId: reserved.usageId ?? "",
            seam: "embedding",
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          actor.releaseForModel(system, {
            usageId: crypto.randomUUID(),
            seam: "menu_match",
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        await expect(
          actor.releaseForModel(system, {
            usageId: reserved.usageId ?? "",
            seam: "summarise_everything",
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          actor.releaseForModel(anonymous, {
            usageId: reserved.usageId ?? "",
            seam: "menu_match",
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });
  },
);

/* -------------------------------------------------------------------------- */
/* D16: one paid allowance for all of Google Places                            */
/* -------------------------------------------------------------------------- */

describe("Google Places paid allowance: parsing and the rule (D16)", () => {
  it("defaults to about $5 beyond the free tier, and reads whole cents", () => {
    expect(DEFAULT_GOOGLE_PLACES_MONTHLY_PAID_CENTS).toBe(500);
    expect(parseGooglePlacesPaidCents(undefined)).toBe(500);
    expect(parseGooglePlacesPaidCents("  ")).toBe(500);
    expect(parseGooglePlacesPaidCents("0")).toBe(0);
    expect(parseGooglePlacesPaidCents(" 750 ")).toBe(750);
    for (const bad of ["-1", "5.5", "five", "1e3", "9".repeat(20)]) {
      expect(() => parseGooglePlacesPaidCents(bad), bad).toThrow(
        ValidationError,
      );
    }
  });

  it("is part of the boot-checked policy, so a malformed value stops the boot", () => {
    expect(
      readModelBudgetPolicy({ GOOGLE_PLACES_MONTHLY_PAID_CENTS: "" }),
    ).toMatchObject({ googlePlacesMonthlyPaidCents: 500 });
    expect(
      readModelBudgetPolicy({ GOOGLE_PLACES_MONTHLY_PAID_CENTS: "120" }),
    ).toMatchObject({ googlePlacesMonthlyPaidCents: 120 });
    expect(() =>
      readModelBudgetPolicy({ GOOGLE_PLACES_MONTHLY_PAID_CENTS: "lots" }),
    ).toThrow(ValidationError);
  });

  it("allows up to the allowance and refuses the call that would cross it", () => {
    const at = (servicePaidCents: number, cost: number, poolCents = 500) =>
      googlePlacesPoolRefusal(
        { servicePaidCents, cost, poolCents },
        "google_places/place_details",
      );
    expect(at(0, 3)).toBeNull();
    expect(at(497, 3)).toBeNull();
    expect(at(498, 3)).toMatch(/paid allowance exhausted: 498 of 500/);
    expect(at(0, 3, 0)).toMatch(/GOOGLE_PLACES_MONTHLY_PAID_CENTS=0/);
  });
});

describe.skipIf(skip)(
  "Google Places paid allowance against Postgres (D16)",
  () => {
    /** What Google Places has booked this month in this database already. */
    const servicePaid = async (db: DbOrTx): Promise<number> => {
      const [row] = await db
        .select({
          cents: sql<string>`coalesce(sum(${apiUsageLog.estimatedCostCents}), 0)`,
        })
        .from(apiUsageLog)
        .where(
          and(
            eq(apiUsageLog.service, GOOGLE_PLACES_BUDGET_SERVICE),
            sql`${apiUsageLog.createdAt} >= date_trunc('month', now(), 'UTC')`,
          ),
        );
      return Number(row?.cents ?? 0);
    };

    /** Rows in this rolled-back transaction only; production's stay untouched. */
    const freeTierOnly = async (
      actor: BudgetActor,
      endpoint: string,
      freeTierMonthlyRequests = 0,
    ) =>
      actor.setBudget(admin, {
        kind: { service: GOOGLE_PLACES_BUDGET_SERVICE, endpoint },
        monthlyBudgetCents: 0,
        freeTierMonthlyRequests,
        isEnabled: true,
      });

    const reserve = (actor: BudgetActor, endpoint: string, cents: number) =>
      actor.reserve(
        system,
        call({
          kind: { service: GOOGLE_PLACES_BUDGET_SERVICE, endpoint },
          estimatedCostCents: cents,
        }),
      );

    it("past the free tier, every endpoint draws on one shared allowance until it is spent", async () => {
      await withTestDb(async (db) => {
        const baseline = await servicePaid(db);
        await withEnv(
          { GOOGLE_PLACES_MONTHLY_PAID_CENTS: String(baseline + 5) },
          async () => {
            const setup = await activate(newBudgetActor(db));
            await freeTierOnly(setup, "place_details");
            await freeTierOnly(setup, "photo");
            const actor = await reactivate(db);

            const details = await reserve(actor, "place_details", 3);
            expect(details.allowed).toBe(true);
            expect(details.effectiveCostCents).toBe(3);

            expect((await reserve(actor, "photo", 1)).allowed).toBe(true);
            expect((await reserve(actor, "photo", 1)).allowed).toBe(true);

            // 5 of 5 spent, across two endpoints: the next call on either is out.
            const over = await reserve(actor, "photo", 1);
            expect(over.allowed).toBe(false);
            expect(over.usageId).toBeNull();
            expect(over.reason).toMatch(/paid allowance exhausted/);
            // N07: typed like every other monthly service limit.
            expect(over.refusal).toBe("SERVICE_BUDGET");
            expect(over.retryAt).toBe(nextMonthStart().toISOString());
            const overDetails = await reserve(actor, "place_details", 3);
            expect(overDetails.allowed).toBe(false);
          },
        );
      });
    });

    it("free-tier calls cost the allowance nothing", async () => {
      await withTestDb(async (db) => {
        const baseline = await servicePaid(db);
        await withEnv(
          { GOOGLE_PLACES_MONTHLY_PAID_CENTS: String(baseline + 3) },
          async () => {
            const setup = await activate(newBudgetActor(db));
            await freeTierOnly(setup, "place_details", 2);
            const actor = await reactivate(db);

            for (let i = 0; i < 2; i += 1) {
              const free = await reserve(actor, "place_details", 3);
              expect(free.allowed).toBe(true);
              expect(free.effectiveCostCents).toBe(0);
            }
            const paid = await reserve(actor, "place_details", 3);
            expect(paid.allowed).toBe(true);
            expect(paid.effectiveCostCents).toBe(3);
            expect((await reserve(actor, "place_details", 3)).allowed).toBe(
              false,
            );
          },
        );
      });
    });

    it("an allowance of 0 is free tier only, as before D16", async () => {
      await withTestDb(async (db) => {
        await withEnv({ GOOGLE_PLACES_MONTHLY_PAID_CENTS: "0" }, async () => {
          const setup = await activate(newBudgetActor(db));
          await freeTierOnly(setup, "nearby_search", 1);
          const actor = await reactivate(db);
          expect((await reserve(actor, "nearby_search", 4)).allowed).toBe(true);
          const over = await reserve(actor, "nearby_search", 4);
          expect(over.allowed).toBe(false);
          expect(over.reason).toMatch(/free tier exhausted/);
        });
      });
    });

    it("an endpoint with its own paid budget still stops at it, inside the allowance", async () => {
      await withTestDb(async (db) => {
        const baseline = await servicePaid(db);
        await withEnv(
          { GOOGLE_PLACES_MONTHLY_PAID_CENTS: String(baseline + 100) },
          async () => {
            const setup = await activate(newBudgetActor(db));
            await setup.setBudget(admin, {
              kind: {
                service: GOOGLE_PLACES_BUDGET_SERVICE,
                endpoint: "text_search",
              },
              monthlyBudgetCents: 4,
              freeTierMonthlyRequests: 0,
              isEnabled: true,
            });
            const actor = await reactivate(db);
            expect((await reserve(actor, "text_search", 4)).allowed).toBe(true);
            const over = await reserve(actor, "text_search", 4);
            expect(over.allowed).toBe(false);
            expect(over.reason).toMatch(/monthly budget exhausted/);
          },
        );
      });
    });

    it("services other than Google Places are untouched by the allowance", async () => {
      await withTestDb(async (db) => {
        await withEnv(
          { GOOGLE_PLACES_MONTHLY_PAID_CENTS: "1000" },
          async () => {
            const service = fixtureService();
            const actor = await activate(newBudgetActor(db));
            await actor.setBudget(admin, {
              kind: { service, endpoint: "call" },
              monthlyBudgetCents: 0,
              freeTierMonthlyRequests: 0,
              isEnabled: true,
            });
            const result = await actor.reserve(
              system,
              call({
                kind: { service, endpoint: "call" },
                estimatedCostCents: 1,
              }),
            );
            expect(result.allowed).toBe(false);
            expect(result.reason).toMatch(/no paid budget is configured/);
          },
        );
      });
    });
  },
);
