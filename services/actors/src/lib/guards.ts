/**
 * The caller gates, each named for exactly who it lets through.
 *
 * ## Why one module
 *
 * The same five questions — "is anyone signed in?", "who is it?", "is this the
 * outbox, a job or an administrator?", "is this the outbox or a job?", "is this
 * an administrator?" — used to be answered by ~17 private helpers under eight
 * names, plus a dozen inline `if (!bypassesPolicy(ctx)) throw …` blocks and a
 * third anonymous-check spelling (`ctx.kind === "user" && ctx.viewerId ===
 * null`). The names had drifted from the behaviour: `#requireSystem` in
 * `ItemActor`, `RecipeActor` and `RecipeGroupActor` admitted administrators
 * too; `BrandActor`'s `requireAdmin` admitted `system`; `CategoryVectorsActor`
 * said "admin only" and admitted `system`. A reader auditing who may call a
 * method had to open each helper to find out, and a reviewer adding a new
 * system-only method would reach for the helper *named* `requireSystem` and get
 * one that also let every administrator in.
 *
 * So the table is here, once:
 *
 * | guard               | anonymous | user | admin | system |
 * | ------------------- | --------- | ---- | ----- | ------ |
 * | `requireSignedIn`   |    no     | yes  |  yes  |  yes   |
 * | `requireViewer`     |    no     | yes  |  yes  |  no¹   |
 * | `requirePrivileged` |    no     |  no  |  yes  |  yes   |
 * | `requireSystem`     |    no     |  no  |  no   |  yes   |
 * | `requireAdmin`      |    no     |  no  |  yes  |  no    |
 *
 * ¹ `system` carries no viewer, so there is nobody to attribute a write to.
 *
 * `src/lib/guards.test.ts` holds that table as data and checks every cell, and
 * scans `src/actors` so a private copy under any of the old names — or a new
 * inline `if (!bypassesPolicy(ctx)) throw` — fails the suite. `bypassesPolicy`
 * itself stays legal: *deciding what to return* for a privileged caller (skip
 * a friendship read, drop a SQL clause, spend without the rate limit) is a data
 * decision and belongs where the data is.
 *
 * ## Every refusal is `Forbidden`
 *
 * These gate the *caller*, not a row, so there is no existence to conceal:
 * "sign in" and "an administrator only" disclose nothing about any aggregate.
 * Hiding a row is the base class's job (`EntityActorBase.refuseAsAbsent`), and
 * a method that does both calls the caller gate **first** — see
 * `requirePrivilegedAggregate` in `./actor-base.ts`.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  isAdmin,
  isSystem,
  ValidationError,
} from "@cellar-assistant/contracts";
import { bypassesPolicy } from "@cellar-assistant/policy";

/**
 * Anyone but an anonymous request. Returns the viewer — `null` only for a
 * privileged caller with no viewer (`system`).
 *
 * Refuses with `sign in to ${what}`.
 */
export const requireSignedIn = (ctx: Ctx, what: string): string | null => {
  if (bypassesPolicy(ctx)) return ctx.viewerId;
  if (ctx.viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return ctx.viewerId;
};

/**
 * A caller with a viewer to attribute a write to: a signed-in user or an
 * administrator. Returns that viewer.
 *
 * Anonymous is `Forbidden` (`sign in to ${what}`); `system`, which has no
 * viewer, is `Validation` (`${what} needs a viewer to attribute it to`) — the
 * request is well-formed as far as authority goes, it just names nobody.
 */
export const requireViewer = (ctx: Ctx, what: string): string => {
  requireSignedIn(ctx, what);
  const viewer = ctx.viewerId;
  if (viewer === null) {
    throw new ValidationError(`${what} needs a viewer to attribute it to`);
  }
  return viewer;
};

/**
 * `system` or an administrator — the outbox, a job, or the manual repair path
 * a human takes when one of those dead-letters. `refusal` is the whole message.
 */
export const requirePrivileged = (ctx: Ctx, refusal: string): void => {
  if (bypassesPolicy(ctx)) return;
  throw new ForbiddenError(refusal);
};

/**
 * `system` alone: the outbox or a job actor, never a request, not even an
 * administrator's. `refusal` is the whole message.
 */
export const requireSystem = (ctx: Ctx, refusal: string): void => {
  if (isSystem(ctx)) return;
  throw new ForbiddenError(refusal);
};

/**
 * An administrator alone — not `system`, which no human is behind. `refusal`
 * is the whole message.
 */
export const requireAdmin = (ctx: Ctx, refusal: string): void => {
  if (isAdmin(ctx)) return;
  throw new ForbiddenError(refusal);
};
