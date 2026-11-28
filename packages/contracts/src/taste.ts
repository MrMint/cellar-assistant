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
import type { ItemRef, ItemType } from "./items.ts";

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

/**
 * Stored style values whose words are not the plain reading of the enum: the
 * item page's own spellings (`formatTeaCategory`, `formatSakeServingTemperature`).
 */
const STYLE_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  pu_erh: "Pu-erh",
  mate: "Maté",
  atsu_kan: "Atsu-kan",
  jo_kan: "Jo-kan",
  nuru_kan: "Nuru-kan",
  hitohada_kan: "Hitohada-kan",
  rei_shu: "Rei-shu",
  yuki_hie: "Yuki-hie",
};

/**
 * A stored style value as a person reads it (F-50): the one label the taste
 * line, the Rated highest rows and the recap's Styles chips all print.
 * `INDIA_PALE_ALE` and `india_pale_ale` → `India pale ale`, `black` →
 * `Black`, `pu_erh` → `Pu-erh`. Free text that already carries a capital
 * ("Nebbiolo", "Saint-Julien") is left as written. The client's
 * `styleLabel` (taste-lines.ts) is the same sentence-case rule, and leaves
 * a label already in this form alone.
 */
export const styleLabel = (raw: string): string => {
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  const override = STYLE_LABEL_OVERRIDES[key];
  if (override !== undefined) return override;
  const isEnum = /^[A-Z0-9_]+$/.test(trimmed) || /^[a-z0-9_]+$/.test(trimmed);
  if (!isEnum && trimmed !== key) return trimmed;
  const words = (isEnum ? key.split("_") : key.split(/\s+/)).filter(
    (word) => word !== "",
  );
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};

/** One style you have rated at least {@link ARCHETYPE_MIN_STYLE_RATINGS} times. */
export type TasteStyleDto = {
  readonly type: ItemType;
  /** The item's style (a variety, a beer style, a process), as {@link styleLabel} prints it. */
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

/**
 * MC-compare / L11: one item both of you rated, as you may see the ratings
 * (the same newest score `agreement` counts, so the rows are its `shared`).
 */
export type TasteCompareRowDto = {
  readonly item: ItemRef;
  /** The item's name, the tie-break of the row order. */
  readonly name: string;
  readonly myScore: number;
  readonly theirScore: number;
};

export type TasteCompareInput = {
  readonly userId: string;
  /** A kind chip: only rows of this type. Absent or null is every type. */
  readonly itemType?: ItemType | null;
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
  /**
   * MC-compare: the items you and a **friend** both rated, biggest
   * difference first, then by name. Empty for anyone who is not your friend
   * (a malformed or unknown id alike), and empty below
   * {@link AGREEMENT_MIN_SHARED} shared items across every type.
   */
  compare(
    ctx: Ctx,
    input: TasteCompareInput,
  ): Promise<readonly TasteCompareRowDto[]>;
};

export const TasteActorDescriptor: ActorDescriptor<TasteActorInterface> = {
  actorType: "TasteActor",
  category: "view",
  methods: {
    // H-10: phrases its line through the `taste_phrase` model seam.
    profile: { modelBacked: true },
    agreement: {},
    friendAgreements: {},
    compare: {},
  },
};

/** Keyed by the viewer, like every view actor (`rankingsActorId`). */
export const tasteActorId = (viewerId: string): string => viewerId;
