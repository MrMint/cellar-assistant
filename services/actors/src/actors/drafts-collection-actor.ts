/**
 * `DraftsCollectionActor(viewerId)` — SV-B (L6, L30). The contract and its
 * reasoning are in `packages/contracts/src/drafts.ts`.
 *
 * Reads only, fresh per call, like every collection actor: `item_onboardings`
 * is `ItemOnboardingActor`'s to write, and nothing here is cached. Every query
 * is pinned to `user_id = viewer` (and, for items, `created_by_id = viewer`),
 * and the key check in `ViewerCollectionActorBase` runs before any of them,
 * so no argument can widen what a viewer reads past their own rows.
 */
import type {
  ActorCategory,
  Ctx,
  DraftsCollectionActorInterface,
  ItemOnboardingDto,
  ItemRef,
  ItemType,
  NeedsDetailsArgs,
} from "@cellar-assistant/contracts";
import {
  DraftsCollectionActorDescriptor,
  FIELD_CONFIDENCE_KEY,
  isItemType,
  requireReverseEdgeBatch,
  sanitiseFieldConfidence,
  ValidationError,
} from "@cellar-assistant/contracts";
import { itemOnboardings } from "@cellar-assistant/db";
import { and, desc, eq, inArray, type SQL } from "@cellar-assistant/db/orm";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import { requireUuidValue } from "../lib/collection-sql.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { onboardingRowToDto } from "./item-onboarding-actor.ts";

/**
 * The fields a label read guessed: those it gave a confidence for
 * (`defaults.fieldConfidence`, "for each field you filled in"), sorted —
 * `jsonb` keeps no key order to preserve.
 */
export const guessedFieldsOf = (defaults: unknown): string[] =>
  typeof defaults === "object" && defaults !== null && !Array.isArray(defaults)
    ? Object.keys(
        sanitiseFieldConfidence(
          (defaults as Record<string, unknown>)[FIELD_CONFIDENCE_KEY],
        ),
      ).sort()
    : [];

export class DraftsCollectionActor
  extends ViewerCollectionActorBase<null>
  implements DraftsCollectionActorInterface
{
  static readonly category: ActorCategory =
    DraftsCollectionActorDescriptor.category;

  async needsDetails(
    ctx: Ctx,
    args: NeedsDetailsArgs,
  ): Promise<readonly ItemOnboardingDto[]> {
    return await this.batch(ctx, null, [], async () => {
      const rows = await this.db
        .select()
        .from(itemOnboardings)
        .where(this.#needsDetailsWhere(ctx, args))
        // No limit (F-73): the API pages over this list and the count counts
        // every row, so a bound here left the oldest drafts unreachable. A
        // draft is written one Finish later at a time, by its owner alone.
        .orderBy(desc(itemOnboardings.updatedAt), desc(itemOnboardings.id));
      return rows.map(onboardingRowToDto);
    });
  }

  async needsDetailsCount(ctx: Ctx, args: NeedsDetailsArgs): Promise<number> {
    return await this.batch(ctx, null, 0, async () => {
      const rows = await this.db
        .select({ id: itemOnboardings.id })
        .from(itemOnboardings)
        .where(this.#needsDetailsWhere(ctx, args));
      return rows.length;
    });
  }

  async unconfirmedFields(
    ctx: Ctx,
    items: readonly ItemRef[],
  ): Promise<readonly (readonly string[])[]> {
    requireReverseEdgeBatch(items, "unconfirmedFields items");
    const refs = items.map((item) => {
      if (!isItemType(item.type)) {
        throw new ValidationError(`"${item.type}" is not an item type`);
      }
      return {
        type: item.type,
        id: requireUuidValue(String(item.id), "item id").toLowerCase(),
      };
    });
    return await this.batch(
      ctx,
      null,
      refs.map(() => []),
      async () => {
        const viewer = this.key;
        // item key -> the onboarding that created it, the viewer's items only.
        const onboardingOf = new Map<string, string>();
        const byType = new Map<ItemType, string[]>();
        for (const ref of refs) {
          byType.set(ref.type, [...(byType.get(ref.type) ?? []), ref.id]);
        }
        for (const [type, ids] of byType) {
          const table = ITEM_TABLES[type];
          const rows = await this.db
            .select({ id: table.id, onboardingId: table.itemOnboardingId })
            .from(table)
            .where(and(inArray(table.id, ids), eq(table.createdById, viewer)));
          for (const row of rows) {
            if (row.onboardingId !== null) {
              onboardingOf.set(`${type}:${row.id}`, row.onboardingId);
            }
          }
        }
        const onboardingIds = [...new Set(onboardingOf.values())];
        const fieldsOf = new Map<string, string[]>();
        if (onboardingIds.length > 0) {
          const rows = await this.db
            .select({
              id: itemOnboardings.id,
              defaults: itemOnboardings.defaults,
              confirmedFields: itemOnboardings.confirmedFields,
            })
            .from(itemOnboardings)
            .where(
              and(
                inArray(itemOnboardings.id, onboardingIds),
                eq(itemOnboardings.userId, viewer),
              ),
            );
          for (const row of rows) {
            const confirmed = new Set(row.confirmedFields);
            fieldsOf.set(
              row.id,
              guessedFieldsOf(row.defaults).filter(
                (field) => !confirmed.has(field),
              ),
            );
          }
        }
        return refs.map((ref) => {
          const onboardingId = onboardingOf.get(`${ref.type}:${ref.id}`);
          return onboardingId === undefined
            ? []
            : (fieldsOf.get(onboardingId) ?? []);
        });
      },
    );
  }

  #needsDetailsWhere(ctx: Ctx, args: NeedsDetailsArgs): SQL | undefined {
    const cellarId =
      args.cellarId === undefined || args.cellarId === null
        ? null
        : requireUuidValue(String(args.cellarId), "cellarId").toLowerCase();
    return and(
      eq(itemOnboardings.userId, ctx.viewerId ?? this.key),
      eq(itemOnboardings.status, "NEEDS_DETAILS"),
      cellarId === null ? undefined : eq(itemOnboardings.cellarId, cellarId),
    );
  }
}
