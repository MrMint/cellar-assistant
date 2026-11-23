/**
 * `TasteActor(viewerId)` — L03's taste profile and friend agreement.
 *
 * A read-only view actor (writes nothing, caches nothing between turns),
 * keyed by the viewer and refusing any other caller on every turn, like
 * `ViewerCollectionActorBase`. Everything it answers is computed by the pure
 * rules in `../lib/taste-agreement.ts` from rows this module loads.
 *
 * ## Whose ratings count, and how privacy is applied
 *
 * A person's rating of an item is their **newest score for it**, from either
 * of the two places a score is written: an `item_reviews` row, or a drink-log
 * entry (`check_ins.score`). They are filtered by the existing policy, never by
 * a rule of this module's:
 *
 * - `item_reviews` are readable by every signed-in viewer
 *   (`ItemActor.reviews`; e4-decisions §"public_item_reviews"), so they count
 *   for anyone the viewer may see at all.
 * - a drink-log score is what `canSeeCheckInDetails` guards (the drinker,
 *   a companion, a friend of the drinker), so another person's log scores
 *   count only through `canSeeCheckInDetailsSql` — the same rule as SQL. A
 *   stranger's private log never reaches the count.
 * - who you may compare with at all is `canSeeProfile`. A malformed id, a
 *   user who does not exist and one the policy hides all answer with the same
 *   `NotFound(PROFILE_NOT_SHARED)` as `UserActor` (L6, D24).
 *
 * ## The model only phrases (L4)
 *
 * The archetype is deterministic. A {@link TastePhraser} may turn it into one
 * sentence; it is never called on thin data (no archetype), it may abstain,
 * and any answer that is not grounded in the facts it was given is dropped for
 * the plain line. `installAI` installs `providerTastePhraser` behind the
 * metered `taste_phrase` seam (H-10, L47); with `AI_PROVIDER` unset the seam
 * stays at {@link unconfiguredTastePhraser}, which throws, and a throw — like a
 * budget refusal or an abstention — leaves the deterministic line.
 */
import type {
  ActorCategory,
  Ctx,
  ItemType,
  TasteActorInterface,
  TasteAgreementDto,
  TasteArchetypeDto,
  TasteProfileDto,
  TasteTypeCountDto,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  isItemType,
  NotFoundError,
  PROFILE_NOT_SHARED,
  TasteActorDescriptor,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy, canSeeProfile } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { handleForId, isEmailShaped } from "../auth/display-name.ts";
import { ActorBase } from "../lib/actor-base.ts";
import { bool, parseModelJson, str } from "../lib/ai/json.ts";
import type { JsonSchema, ProviderFor } from "../lib/ai/types.ts";
import { canSeeCheckInDetailsSql } from "../lib/check-in-visibility.ts";
import { uuidArray } from "../lib/collection-sql.ts";
import { actorDb, type DbOrTx } from "../lib/db.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import {
  agreementOf,
  archetypeOf,
  fallbackLine,
  type TasteRating,
  typeCounts,
} from "../lib/taste-agreement.ts";
import { isUuid } from "../lib/uuid.ts";
import { friendIdsOf, friendshipsOf } from "../lib/visibility.ts";
import {
  type VisibilityScope,
  visibilityScope,
} from "../lib/visibility-sql.ts";

/* -------------------------------------------------------------------------- */
/* The phrasing seam                                                           */
/* -------------------------------------------------------------------------- */

export type TastePhraseInput = {
  readonly ratingCount: number;
  readonly types: readonly TasteTypeCountDto[];
  readonly archetype: TasteArchetypeDto;
};

/** One sentence, or `null` to abstain. Never called on thin data. */
export type TastePhraser = (
  ctx: Ctx,
  input: TastePhraseInput,
) => Promise<string | null>;

/** A phraser that always abstains. Tests inject it; production never does. */
export const noTastePhraser: TastePhraser = async () => null;

/**
 * The seam's default before `installAI` fills it: loud, like every other
 * seam's (`no-silent-fallback.test.ts`). `TasteActor.profile` treats the throw
 * as an abstention, so the page still answers with the deterministic line.
 */
export const unconfiguredTastePhraser: TastePhraser = async () => {
  throw new ConflictError(
    "TasteActor.profile has no AI provider wired for taste_phrase: " +
      "AI_PROVIDER is unset, so `installAI()` installed nothing at boot. See " +
      "services/actors/README.md · Local AI.",
    "AI_UNCONFIGURED",
  );
};

/**
 * The installed phraser. A registry rather than a wider constructor for the
 * reason `setInsightsGenerator` gives: Dapr builds an actor from
 * `(daprClient, id)` alone.
 */
let installedTastePhraser: TastePhraser = unconfiguredTastePhraser;

export const setTastePhraser = (next: TastePhraser): void => {
  installedTastePhraser = next;
};

export const tastePhraser = (): TastePhraser => installedTastePhraser;

/**
 * Property order is generation order: the model first says whether the facts
 * support a line at all, and only then writes it (L4, the abstention pattern
 * `providerFlavourTags` uses).
 */
export const TASTE_PHRASE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    factsSupportALine: {
      type: "boolean",
      description:
        "false when the facts are too few or too mixed to say anything true",
    },
    line: {
      type: "string",
      nullable: true,
      description:
        "one sentence, at most 30 words, naming only styles from the facts; no numbers",
    },
  },
  required: ["factsSupportALine", "line"],
};

export const tastePhrasePrompt = (input: TastePhraseInput): string => {
  const style = (s: { label: string; type: ItemType }) =>
    `${s.label} (${s.type.toLowerCase()})`;
  return [
    "You describe a person's drinks taste in one plain sentence, from facts",
    "computed from their own ratings. Use only the facts. Do not invent styles,",
    "regions or flavours, and do not write any number. If the facts do not",
    "support a sentence, set factsSupportALine to false and line to null.",
    "",
    `Archetype: ${input.archetype.title}`,
    `Rated highest: ${input.archetype.loves.map(style).join("; ") || "none"}`,
    `Rated lowest: ${input.archetype.lessKeen.map(style).join("; ") || "none"}`,
    `Types rated: ${input.types.map((t) => t.type.toLowerCase()).join(", ")}`,
  ].join("\n");
};

/**
 * Grounding: a line must name at least one of the styles it was given and
 * carry no digits (no invented numbers, L4). Anything else is dropped.
 */
export const groundTasteLine = (
  line: string,
  input: TastePhraseInput,
): string | null => {
  if (/\d/.test(line) || line.length > 240) return null;
  const lower = line.toLowerCase();
  const named = [...input.archetype.loves, ...input.archetype.lessKeen].some(
    (style) => lower.includes(style.label.toLowerCase()),
  );
  return named ? line : null;
};

/** What the `taste_phrase` seam installs (H-10): one "low" call, abstain first. */
export const providerTastePhraser =
  (provider: ProviderFor): TastePhraser =>
  async (ctx, input) => {
    const response = await provider(ctx).generateContent(
      { prompt: tastePhrasePrompt(input), schema: TASTE_PHRASE_SCHEMA },
      "low",
    );
    const parsed = parseModelJson(response.content, "taste phrase");
    const supports = bool(parsed.factsSupportALine);
    if (supports === null) {
      throw new ConflictError(
        "the model's taste phrase answer has no factsSupportALine",
      );
    }
    if (!supports) return null;
    const line = str(parsed.line);
    return line === null ? null : groundTasteLine(line, input);
  };

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

const REVIEWS = ARCS.itemReviews;
const CHECK_INS = ARCS.checkIns;

/** The style value each type's archetype groups by. */
const STYLE_OF: Readonly<Record<ItemType, (id: SQL) => SQL>> = {
  WINE: (id) =>
    sql`(select coalesce(w.variety, w.style) from public.wines w where w.id = ${id})`,
  BEER: (id) => sql`(select b.style from public.beers b where b.id = ${id})`,
  SPIRIT: (id) =>
    sql`(select coalesce(s.style, s.type) from public.spirits s where s.id = ${id})`,
  COFFEE: (id) =>
    sql`(select c.process::text from public.coffees c where c.id = ${id})`,
  SAKE: (id) =>
    sql`(select coalesce(k.category, k.type) from public.sakes k where k.id = ${id})`,
  TEA: (id) => sql`(select t.category from public.teas t where t.id = ${id})`,
};

const styleCase = (): SQL =>
  sql`case n.type ${sql.join(
    (Object.keys(STYLE_OF) as ItemType[]).map(
      (type) => sql`when ${type} then ${STYLE_OF[type](sql`n.item_id`)}`,
    ),
    sql` `,
  )} end`;

type RatingRow = {
  readonly type: string;
  readonly item_id: string;
  readonly score: number | string;
  readonly style: string | null;
};

/**
 * `subject`'s newest score per item, as `scope` may see it. Reviews count
 * for every signed-in viewer; drink-log scores only where
 * `canSeeCheckInDetails` admits them.
 */
export const ratingsOf = async (
  db: DbOrTx,
  scope: VisibilityScope,
  subject: string,
): Promise<TasteRating[]> => {
  if (scope.kind === "nothing") return [];
  const { rows } = await db.execute<RatingRow>(sql`
    with raw as (
      select ${REVIEWS.typeExpr("r")} as type, ${REVIEWS.idExpr("r")} as item_id,
             r.score::float8 as score, r.updated_at as at
      from public.item_reviews r
      where r.user_id = ${subject}::uuid
      union all
      select ${CHECK_INS.typeExpr("ci")}, ${CHECK_INS.idExpr("ci")},
             ci.score::float8, ci.created_at
      from public.check_ins ci
      where ci.user_id = ${subject}::uuid
        and ci.score is not null
        and ${canSeeCheckInDetailsSql(scope, "ci")}
    ), newest as (
      select distinct on (type, item_id) type, item_id, score
      from raw
      where type is not null and item_id is not null
      order by type, item_id, at desc nulls last
    )
    select n.type, n.item_id::text as item_id, n.score, ${styleCase()} as style
    from newest n
    order by n.type, n.item_id`);
  return rows.flatMap((row) => {
    const score = Number(row.score);
    if (!isItemType(row.type) || !Number.isFinite(score)) return [];
    return [{ type: row.type, itemId: row.item_id, score, style: row.style }];
  });
};

type UserRow = {
  readonly id: string;
  readonly name: string;
  readonly image: string | null;
};

const displayName = (row: UserRow): string =>
  row.name.trim() === "" || isEmailShaped(row.name)
    ? handleForId(row.id)
    : row.name;

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class TasteActor extends ActorBase implements TasteActorInterface {
  static readonly category: ActorCategory = TasteActorDescriptor.category;

  readonly #phraser: TastePhraser;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    phraser: TastePhraser = tastePhraser(),
  ) {
    super(daprClient, id, db);
    this.#phraser = phraser;
  }

  /** Keyed by the viewer is not authorised as the viewer (C2): every turn. */
  #requireKey(ctx: Ctx, what: string): string {
    requireSignedIn(ctx, what);
    const viewer = ctx.viewerId;
    if (viewer !== null && viewer === this.key) return viewer;
    throw new ForbiddenError(
      `TasteActor(${this.key}) may only be called by that viewer`,
    );
  }

  async profile(ctx: Ctx): Promise<TasteProfileDto> {
    const viewer = this.#requireKey(ctx, "see your taste profile");
    const ratings = await ratingsOf(
      this.db,
      await visibilityScope(this.db, ctx),
      viewer,
    );
    const types = typeCounts(ratings);
    const archetype = archetypeOf(ratings);
    const plain = fallbackLine(ratings.length, archetype, types.length);
    if (archetype === null) {
      return {
        ratingCount: ratings.length,
        types,
        archetype,
        line: plain,
        linePhrasedByAi: false,
      };
    }
    let phrased: string | null = null;
    try {
      phrased = await this.#phraser(ctx, {
        ratingCount: ratings.length,
        types,
        archetype,
      });
    } catch {
      // A failed phrasing (no provider, an exhausted budget, an ungrounded or
      // malformed answer) is an abstention: the deterministic line stands, and
      // the page says nothing about AI.
      phrased = null;
    }
    return {
      ratingCount: ratings.length,
      types,
      archetype,
      line: phrased ?? plain,
      linePhrasedByAi: phrased !== null,
    };
  }

  async agreement(ctx: Ctx, userId: string): Promise<TasteAgreementDto> {
    const viewer = this.#requireKey(ctx, "compare tastes");
    if (!isUuid(userId) || userId === viewer) {
      throw new NotFoundError(PROFILE_NOT_SHARED);
    }
    const [other] = await this.#users([userId]);
    if (other === undefined || !canSeeProfile(ctx, { userId })) {
      throw new NotFoundError(PROFILE_NOT_SHARED);
    }
    const scope = await visibilityScope(this.db, ctx);
    const mine = await ratingsOf(this.db, scope, viewer);
    return this.#agreementWith(scope, mine, other);
  }

  async friendAgreements(ctx: Ctx): Promise<readonly TasteAgreementDto[]> {
    const viewer = this.#requireKey(ctx, "compare tastes");
    const friendIds = friendIdsOf(viewer, await friendshipsOf(this.db, viewer));
    if (friendIds.length === 0) return [];
    const scope = await visibilityScope(this.db, ctx);
    const mine = await ratingsOf(this.db, scope, viewer);
    const friends = (await this.#users(friendIds)).filter(
      (row) => bypassesPolicy(ctx) || canSeeProfile(ctx, { userId: row.id }),
    );
    const rows: TasteAgreementDto[] = [];
    for (const friend of friends) {
      rows.push(await this.#agreementWith(scope, mine, friend));
    }
    return rows.sort(
      (a, b) => b.shared - a.shared || a.name.localeCompare(b.name),
    );
  }

  async #agreementWith(
    scope: VisibilityScope,
    mine: readonly TasteRating[],
    other: UserRow,
  ): Promise<TasteAgreementDto> {
    const theirs = await ratingsOf(this.db, scope, other.id);
    const agreement = agreementOf(mine, theirs);
    return {
      userId: other.id,
      name: displayName(other),
      avatarUrl:
        other.image === null || other.image === "" ? null : other.image,
      shared: agreement.shared,
      agreed: agreement.agreed,
      byType: agreement.byType,
    };
  }

  async #users(ids: readonly string[]): Promise<UserRow[]> {
    const { rows } = await this.db.execute<UserRow>(sql`
      select u.id::text as id, u.name, u.image
      from public."user" u
      where u.id = any(${uuidArray(ids, "userId")})
        and coalesce(u.disabled, false) = false`);
    return rows;
  }
}
