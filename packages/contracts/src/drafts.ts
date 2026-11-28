/**
 * `DraftsCollectionActor(viewerId)` — SV-B (L6, L30).
 *
 * The viewer's saved "Needs details" drafts: `item_onboardings` rows of
 * theirs at `NEEDS_DETAILS`, listed and counted per cellar (or across all of
 * them), plus `Item.unconfirmedFields` — the guesses on items the viewer
 * created that they never accepted or edited.
 *
 * Drafts are per account and owner-only, like every onboarding (§2.1): a
 * viewer only ever reads their own rows, so naming another person's cellar
 * answers that viewer's drafts aimed at it — none — and says nothing about the
 * cellar. A draft is not a cellar item until its floor is met (L6), so the
 * cellar's count is this count, not a `cellar_items` one.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemRef } from "./items.ts";
import type { ItemOnboardingDto } from "./onboarding.ts";

export type NeedsDetailsArgs = {
  /** One cellar's drafts; absent or `null` for all the viewer's. */
  readonly cellarId?: string | null;
};

export type DraftsCollectionActorInterface = {
  /** Newest first. Whole rows: a draft list is short and owner-only. */
  needsDetails(
    ctx: Ctx,
    args: NeedsDetailsArgs,
  ): Promise<readonly ItemOnboardingDto[]>;
  needsDetailsCount(ctx: Ctx, args: NeedsDetailsArgs): Promise<number>;
  /**
   * Aligned to `items`: for each, the fields the label read guessed
   * (`defaults.fieldConfidence`) less the ones the person confirmed, from the
   * onboarding that created it. Empty for an item the viewer did not create,
   * or one made without a read. At most `REVERSE_EDGE_MAX_PARENTS` items.
   */
  unconfirmedFields(
    ctx: Ctx,
    items: readonly ItemRef[],
  ): Promise<readonly (readonly string[])[]>;
  /**
   * F-76: how many of the viewer's bottles — not empty, open or sealed, in
   * any cellar they created or co-own — are of an item they created whose
   * `unconfirmedFields` is not empty. Home's "n to check".
   */
  unconfirmedBottleCount(ctx: Ctx): Promise<number>;
};

export const DraftsCollectionActorDescriptor: ActorDescriptor<DraftsCollectionActorInterface> =
  {
    actorType: "DraftsCollectionActor",
    category: "collection",
    methods: {
      needsDetails: {},
      needsDetailsCount: {},
      unconfirmedFields: {},
      unconfirmedBottleCount: {},
    },
  };
