/**
 * `RecapActor(viewerId)` — L04's read-only view actor: the viewer's recap deck
 * for a month or a year, and their breadth stamps.
 *
 * | method | serves |
 * |---|---|
 * | `recap` | `/recap` and the share images (`/api/recap/...`) |
 * | `stamps` | Me's `MeStamps` slot |
 *
 * It reads check-ins through its own query (`recap-sql.ts`) into its own row
 * type, never `ItemCheckInDto` (L32, L45), and computes every card and stamp
 * with the pure functions in `recap-cards.ts`. Keyed by the viewer, and every
 * turn checks `ctx.viewerId === this.key` (as `BarActor` does): a recap is the
 * owner's alone (L16), so another signed-in user is refused like anyone else.
 *
 * Holds nothing and writes nothing; no entry in `TABLE_WRITERS`.
 */
import type {
  ActorCategory,
  BreadthStampDto,
  Ctx,
  RecapActorInterface,
  RecapDto,
  RecapInput,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  formatRecapPeriod,
  normaliseRecapTimeZone,
  parseRecapPeriod,
  RecapActorDescriptor,
  recapPeriodBounds,
  ValidationError,
} from "@cellar-assistant/contracts";
import { ActorBase } from "../lib/actor-base.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { computeStamps, selectRecapCards } from "../lib/recap-cards.ts";
import { readRecapLogs } from "../lib/recap-sql.ts";
import { recipeScope } from "../lib/recipe-visibility.ts";

export class RecapActor extends ActorBase implements RecapActorInterface {
  static readonly category: ActorCategory = RecapActorDescriptor.category;

  async recap(ctx: Ctx, input: RecapInput): Promise<RecapDto> {
    this.#requireViewerKey(ctx);
    const period = parseRecapPeriod(input?.period);
    if (period === null) {
      throw new ValidationError(
        `not a recap period (YYYY or YYYY-MM): ${String(input?.period)}`,
      );
    }
    const timeZone = normaliseRecapTimeZone(input?.timeZone);
    if (timeZone === null) {
      throw new ValidationError(`not a time zone: ${String(input?.timeZone)}`);
    }
    const scope = await recipeScope(this.db, ctx);
    const rows = await readRecapLogs(this.db, this.key, scope, {
      ...recapPeriodBounds(period),
      timeZone,
    });
    return {
      period: formatRecapPeriod(period),
      timeZone,
      cards: selectRecapCards(rows),
      stamps: computeStamps(rows),
    };
  }

  async stamps(ctx: Ctx): Promise<readonly BreadthStampDto[]> {
    this.#requireViewerKey(ctx);
    const scope = await recipeScope(this.db, ctx);
    return computeStamps(await readRecapLogs(this.db, this.key, scope, null));
  }

  #requireViewerKey(ctx: Ctx): void {
    requireSignedIn(ctx, "read a recap");
    if (ctx.viewerId !== null && ctx.viewerId === this.key) return;
    throw new ForbiddenError(
      `RecapActor(${this.key}) may only be called by that viewer`,
    );
  }
}
