/**
 * The two ways a paid external call reserves against `BudgetActor` before it
 * spends — one seam type, two doors.
 *
 * `PlaceActor` and `GooglePlacesActor` each declared their own
 * `BudgetReserver` type and their own `daprBudgetReserver`, identical in shape
 * and differing in one string: the method. They share the type here, and the
 * method is the adapter's name rather than a literal inside it.
 *
 * (The model seams' doors, `reserveForModel`/`settleForModel`, are a different
 * shape — a reservation and a settlement — and stay with the metering in
 * `./ai/budget.ts`.)
 */
import {
  BUDGET_ACTOR_ID,
  BudgetActorDescriptor,
  type Ctx,
  type ReserveInput,
  type ReserveResult,
} from "@cellar-assistant/contracts";
import { internal } from "./internal-client.ts";

/** Injected, so the no-sidecar harness can substitute an in-process fake. */
export type BudgetReserver = (
  ctx: Ctx,
  input: ReserveInput,
) => Promise<ReserveResult>;

/**
 * `BudgetActor.reserve` — `system` or `admin` only. `PlaceActor` reserves
 * inside outbox-delivered (`system`) turns such as `enrichFromGoogle` (§8.5:
 * entity → `BudgetActor`).
 */
export const daprBudgetReserver: BudgetReserver = (ctx, input) =>
  internal(ctx)(BudgetActorDescriptor, BUDGET_ACTOR_ID).reserve(input);

/**
 * `BudgetActor.reserveForSearch` — for a search actor, with the asking user's
 * own ctx. Not `reserve`: that one is system-or-admin only, and a search actor
 * may not mint a `system` ctx (§1.6, `src/lib/system-ctx.test.ts`).
 * `reserveForSearch` is B5's narrow door for exactly this — allow-listed
 * endpoints, cost set by the actor, `triggeredBy` forced to the viewer.
 */
export const daprSearchBudgetReserver: BudgetReserver = (ctx, input) =>
  internal(ctx)(BudgetActorDescriptor, BUDGET_ACTOR_ID).reserveForSearch(input);
