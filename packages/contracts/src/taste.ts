/**
 * L03 · the taste profile and friend agreement (wave C "taste").
 *
 * `TasteActor(viewerId)` is a read-only view actor (L45: a new actor, because
 * the existing collection actors are another stream's this batch). It serves
 * two things, both computed server-side and both deterministic:
 *
 * - **the profile**: your cross-type archetype from your own ratings and the
 *   styles of what you rated. The archetype is a rule over counts and
 *   averages (`services/actors/src/lib/taste-agreement.ts`); a model may only
 *   *phrase* it, and abstains first (L4) — thin data never reaches a model.
 * - **agreement**: how many items you and another user both rated, and on how
 *   many of those you agree. A count, never a percentage or a cosine, and the
 *   agreed count is withheld below {@link AGREEMENT_MIN_SHARED} shared items.
 *
 * `docs/product/decisions.md` ("Taste profile and friend agreement") records
 * what "agree" means and why the gate is five.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemType } from "./items.ts";

/** Two scores agree when they are at most half a star apart. */
export const AGREEMENT_MAX_DIFFERENCE = 0.5;

/** The minimum overlap N: below it, agreement is not shown (L30). */
export const AGREEMENT_MIN_SHARED = 5;

/** Fewer ratings than this and there is no archetype, and no model call. */
export const ARCHETYPE_MIN_RATINGS = 10;

/** A style counts towards the archetype once you have rated it this often. */
export const ARCHETYPE_MIN_STYLE_RATINGS = 2;

export const TASTE_ARCHETYPE_KEYS = [
  "GENEROUS",
  "EXACTING",
  "DEVOTED",
  "EXPLORER",
  "DECISIVE",
  "FOCUSED",
] as const;

export type TasteArchetypeKey = (typeof TASTE_ARCHETYPE_KEYS)[number];

/** One style you have rated at least {@link ARCHETYPE_MIN_STYLE_RATINGS} times. */
export type TasteStyleDto = {
  readonly type: ItemType;
  /** The item's style value as stored (a variety, a beer style, a process). */
  readonly label: string;
  readonly count: number;
  /** Mean of your scores for it, 0.5–5. */
  readonly average: number;
};

export type TasteTypeCountDto = {
  readonly type: ItemType;
  /** Distinct items of this type you have rated. */
  readonly count: number;
};

export type TasteArchetypeDto = {
  readonly key: TasteArchetypeKey;
  /** Short, deterministic title ("Cross-cellar explorer"). */
  readonly title: string;
  /** Styles you rate above your own average, best first (at most 4). */
  readonly loves: readonly TasteStyleDto[];
  /** Styles you rate below your own average, lowest first (at most 2). */
  readonly lessKeen: readonly TasteStyleDto[];
};

export type TasteProfileDto = {
  /** Distinct items you have rated, across every type. */
  readonly ratingCount: number;
  /** Most rated first; types you have not rated are left out. */
  readonly types: readonly TasteTypeCountDto[];
  /** `null` below {@link ARCHETYPE_MIN_RATINGS}, or with too few styles. */
  readonly archetype: TasteArchetypeDto | null;
  /** One sentence. Deterministic unless `linePhrasedByAi`. */
  readonly line: string;
  readonly linePhrasedByAi: boolean;
};

export type TasteAgreementTypeDto = {
  readonly type: ItemType;
  readonly shared: number;
  /** `null` below the gate, like the total. */
  readonly agreed: number | null;
};

export type TasteAgreementDto = {
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  /** Items both of you rated, counting only ratings you may see. */
  readonly shared: number;
  /** `null` while `shared` < {@link AGREEMENT_MIN_SHARED}. */
  readonly agreed: number | null;
  /** Per type, most shared first; empty below the gate. */
  readonly byType: readonly TasteAgreementTypeDto[];
};

export type TasteActorInterface = {
  profile(ctx: Ctx): Promise<TasteProfileDto>;
  /**
   * Agreement with one user. A malformed id, a missing user and one
   * `canSeeProfile` hides answer alike: `NotFound(PROFILE_NOT_SHARED)`.
   */
  agreement(ctx: Ctx, userId: string): Promise<TasteAgreementDto>;
  /** Agreement with each of your friends, most shared first. */
  friendAgreements(ctx: Ctx): Promise<readonly TasteAgreementDto[]>;
};

export const TasteActorDescriptor: ActorDescriptor<TasteActorInterface> = {
  actorType: "TasteActor",
  category: "view",
  methods: {
    // H-10: phrases its line through the `taste_phrase` model seam.
    profile: { modelBacked: true },
    agreement: {},
    friendAgreements: {},
  },
};

/** Keyed by the viewer, like every view actor (`rankingsActorId`). */
export const tasteActorId = (viewerId: string): string => viewerId;
