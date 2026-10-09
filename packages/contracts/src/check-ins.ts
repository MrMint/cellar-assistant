/**
 * The drink log (X02, decisions D5 and D8).
 *
 * One rating per item — the review, `ItemActor.upsertReview` — plus **many
 * logs**: "I had this, here, with these people, and this is what I noticed".
 * A log is a `check_ins` row. Before X02 that row was a timestamp bound to a
 * bottle and deleted with it; now it is about an *item*, the bottle is an
 * optional detail (`cellar_item_id`, nulled — never deleted — when the bottle
 * goes), and it carries an optional score, note, flavour tags, place, photo
 * and companions.
 *
 * `CheckInActor(checkInId)` is the writer (`packages/db/src/writers.ts`).
 * It is keyed by the row id the caller mints, which is also the idempotency
 * key (§8.4): a retried `log` with the same id answers the row it already
 * wrote.
 *
 * ## A log's score is not the review
 *
 * Both are half stars on the same scale, and they are deliberately separate
 * columns in separate tables: logging "★3, corked" on Tuesday does not move the
 * ★4.5 the drinker gave the wine. Nothing in this module writes `item_reviews`.
 *
 * ## Companions: the existing "who drank with you" model, kept
 *
 * `bulkCheckIn` already wrote one row per drinker, each about that drinker.
 * A log with companions does the same, and the rows written together share a
 * `group_id` — the occasion — which is how an entry says "with Sam" and how
 * Sam sees the entry that names him (`canSeeCheckIn`'s companion branch).
 * Companion rows carry the occasion (item, bottle, place, time) and never the
 * logger's score, note, tags or photo: those are one person's opinion.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import { ValidationError } from "./errors.ts";
import type { ItemRef, ItemType } from "./items.ts";

/** `check_ins_score_half_stars` — the same set `item_reviews` allows. */
export const CHECK_IN_SCORES = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
] as const;

export const isCheckInScore = (value: number): boolean =>
  (CHECK_IN_SCORES as readonly number[]).includes(value);

/** `check_ins_note_length`. */
export const MAX_CHECK_IN_NOTE_LENGTH = 2000;
/** `check_ins_tags_count`. */
export const MAX_CHECK_IN_TAGS = 12;
/** A flavour word, not a sentence. */
export const MAX_CHECK_IN_TAG_LENGTH = 32;
/** You drank it with a table, not a stadium — `bulkCheckIn`'s cap, kept. */
export const MAX_CHECK_IN_DRINKERS = 100;

/**
 * How far ahead of the server's clock a `drankAt` may be: a phone whose
 * clock runs a little fast logs "now", not "the future".
 */
export const MAX_DRANK_AT_SKEW_MS = 5 * 60 * 1000;
/** The earliest a drink can be backdated to. Before it is a typo. */
export const EARLIEST_DRANK_AT = "1900-01-01T00:00:00.000Z";

/**
 * How long a removed log can be put back (`restoreDrinkLog`, the Undo after
 * a delete). The toast offers it for seconds; the window is generous so a
 * slow network or a retry still finds the rows, and short so a deleted
 * note does not linger.
 */
export const DRINK_LOG_RESTORE_WINDOW_MS = 60 * 60 * 1000;

/**
 * When a drink was had — `check_ins.created_at`, which is what every log
 * orders and dates by. Absent (or `null`) is `now`; a backdated log names
 * its own instant. A value later than `now` + {@link MAX_DRANK_AT_SKEW_MS} or
 * earlier than {@link EARLIEST_DRANK_AT}, or one that is not an instant, is a
 * `ValidationError`. Shared by `CheckInActor` and the log sheet, so the
 * picker never offers a time the server refuses.
 */
export const parseDrankAt = (
  value: string | null | undefined,
  now: Date,
): Date => {
  if (value === null || value === undefined) return now;
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime())) {
    throw new ValidationError(
      `drankAt must be an ISO-8601 instant, got ${JSON.stringify(value)}`,
    );
  }
  if (at.getTime() > now.getTime() + MAX_DRANK_AT_SKEW_MS) {
    throw new ValidationError("a drink can't be logged in the future");
  }
  if (at.getTime() < Date.parse(EARLIEST_DRANK_AT)) {
    throw new ValidationError(
      `a drink can't be backdated before ${EARLIEST_DRANK_AT.slice(0, 4)}`,
    );
  }
  return at;
};

/**
 * One tag's canonical spelling: trimmed, inner whitespace collapsed, lower
 * case. `null` for a tag that is empty once trimmed. Throws for one longer
 * than {@link MAX_CHECK_IN_TAG_LENGTH} — silently cutting a word in half
 * would store a different word.
 */
export const normaliseCheckInTag = (tag: string): string | null => {
  const value = String(tag).trim().replace(/\s+/g, " ").toLowerCase();
  if (value === "") return null;
  if (value.length > MAX_CHECK_IN_TAG_LENGTH) {
    throw new ValidationError(
      `a flavour tag must be ${MAX_CHECK_IN_TAG_LENGTH} characters or less, got "${value.slice(0, 40)}…"`,
    );
  }
  return value;
};

/**
 * The tag list as stored: each normalised, blanks dropped, duplicates removed
 * (first spelling wins, order kept), at most {@link MAX_CHECK_IN_TAGS}.
 * Over the cap is a `ValidationError`, not a silent truncation.
 */
export const normaliseCheckInTags = (tags: readonly string[]): string[] => {
  if (!Array.isArray(tags)) {
    throw new ValidationError("tags must be a list of strings");
  }
  const seen = new Set<string>();
  for (const tag of tags) {
    const value = normaliseCheckInTag(tag);
    if (value !== null) seen.add(value);
  }
  if (seen.size > MAX_CHECK_IN_TAGS) {
    throw new ValidationError(
      `a log takes at most ${MAX_CHECK_IN_TAGS} flavour tags, got ${seen.size}`,
    );
  }
  return Array.from(seen);
};

/** The bottle a log was poured from — both ids, because `CellarActor` is keyed by cellar. */
export type CheckInBottleRef = {
  readonly cellarId: string;
  readonly cellarItemId: string;
};

export type LogDrinkInput = {
  /**
   * What was drunk. Required unless `bottle` is given, in which case it is
   * read off the bottle — and if both are given they must agree.
   */
  readonly item?: ItemRef | null;
  /** The bottle, when it came from a cellar. The cellar must be visible to the viewer. */
  readonly bottle?: CheckInBottleRef | null;
  /** Half stars, or `null`/absent for no score. Never touches the review. */
  readonly score?: number | null;
  readonly note?: string | null;
  /** Flavour words the drinker confirmed. Suggested ones arrive here only after a tap. */
  readonly tags?: readonly string[] | null;
  readonly placeId?: string | null;
  /** A verified upload of the viewer's own (`FileActor`). */
  readonly photoFileId?: string | null;
  /**
   * Friends who drank it too — each gets a row of their own, about them,
   * in the same occasion. Each must be a friend of the viewer; one that is
   * not rejects the whole call (`bulkCheckIn`'s rule).
   */
  readonly companionIds?: readonly string[] | null;
  /**
   * Whether the viewer drank too. Defaults to `true`. `false` is
   * `bulkCheckIn` without your own id — logging a round for friends — and
   * then needs at least one companion.
   */
  readonly includeSelf?: boolean | null;
  /**
   * When it was drunk (an ISO instant) — backdating a log. Absent is now.
   * Every row of the occasion carries it. See {@link parseDrankAt}.
   */
  readonly drankAt?: string | null;
};

/**
 * A partial edit of the viewer's own entry. Absent leaves a field alone;
 * `null` clears it (`tags: []` clears the tags).
 */
export type UpdateDrinkLogInput = {
  readonly score?: number | null;
  readonly note?: string | null;
  readonly tags?: readonly string[] | null;
  readonly placeId?: string | null;
  readonly photoFileId?: string | null;
  /**
   * Re-date the drink (an ISO instant; never cleared). On the entry you
   * logged for a table it moves the companions' entries you wrote with it
   * too — the ones their drinkers have not made their own — so the occasion
   * stays one evening.
   */
  readonly drankAt?: string;
};

/**
 * Who else was there, after the fact: the **complete** set of friends who
 * drank with you (not a delta). A friend added gets an entry of their own in
 * the same occasion; one left out loses the entry you wrote for them — unless
 * they have added to it, which makes it theirs and is a `ConflictError`.
 */
export type SetDrinkLogCompanionsInput = {
  readonly companionIds: readonly string[];
};

/**
 * One log entry as anyone allowed to see it sees it.
 *
 * `cellarItemId` is deliberately **absent** (as it always was on the item
 * page's check-ins): a friend-of-the-drinker may see the entry without being
 * able to see the cellar, and the bottle's id is a row inside that cellar.
 * `fromCellar` says only that it was poured from a bottle — and only to the
 * drinker themself; everyone else reads `false`.
 */
export type ItemCheckInDto = {
  readonly id: string;
  /** `check_ins.user_id` — who the entry is *about* (`bulkCheckIn`, §2.1). */
  readonly userId: string;
  /** `check_ins.created_by_id` — who wrote it; differs for a companion row. */
  readonly createdById: string;
  /** The item this entry is on. */
  readonly item: ItemRef;
  /** Half stars, or `null`. Not the review. */
  readonly score: number | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly placeId: string | null;
  readonly photoFileId: string | null;
  /**
   * The other drinkers in the same occasion (`group_id`), as user ids. The
   * entry's own `userId` is not repeated here.
   */
  readonly companionIds: readonly string[];
  /** See the type doc: the drinker's own view only. */
  readonly fromCellar: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** What `log` wrote. */
export type LoggedDrinkDto = {
  /** The row this actor is keyed by: the viewer's own, or the first companion's. */
  readonly entry: ItemCheckInDto;
  /** Every row written, keyed row first, one per drinker. */
  readonly rows: readonly {
    readonly id: string;
    readonly userId: string;
  }[];
  /** The bottle every row points at, or `null` for a bottle-less log. */
  readonly cellarItemId: string | null;
};

export type RemovedCheckIns = {
  /** Every row removed — the keyed one first. */
  readonly ids: readonly string[];
};

/** What `restore` put back: the same rows, ids and dates as before. */
export type RestoredCheckIns = {
  /** Every row restored — the keyed one first. */
  readonly ids: readonly string[];
  /** The keyed entry, as the viewer sees it. */
  readonly entry: ItemCheckInDto;
};

/* -------------------------------------------------------------------------- */
/* Suggested flavour tags — an abstaining AI seam                              */
/* -------------------------------------------------------------------------- */

/** The shortest note worth asking a model about. */
export const MIN_FLAVOUR_NOTE_LENGTH = 3;
/** At most this many suggestions come back. */
export const MAX_FLAVOUR_SUGGESTIONS = 6;

export type SuggestFlavourTagsInput = {
  /** What the drinker typed. */
  readonly note: string;
  /** What they were drinking, so "bright" means acidity and not a colour. */
  readonly itemType: ItemType;
  /** Tags already on the log, never suggested again. */
  readonly existing?: readonly string[] | null;
};

/**
 * Words lifted out of the drinker's own note — **suggestions**, rendered as
 * `AIDraftField source="suggested"` chips that do nothing until tapped.
 *
 * `abstained` is the seam saying "this note names no flavour" ("great night!",
 * "meh"), which is an answer, not a failure: the sheet shows no chips. The
 * seam only returns words it can point at in the note (`evidence`), never a
 * flavour the note does not mention.
 */
export type FlavourTagSuggestionDto = {
  readonly abstained: boolean;
  readonly tags: readonly {
    readonly tag: string;
    /** The words in the note it was read from, verbatim. */
    readonly evidence: string;
  }[];
};

/**
 * `CheckInActor(checkInId)` — entity actor, **X02**.
 *
 * - `log` creates the row this actor is keyed by (and its companion rows).
 * - `get` / `update` / `remove` act on that row. Visibility is `canSeeCheckIn`
 *   and a row the viewer may not see is `NotFound`, identical to a missing one.
 * - `setCompanions` replaces who else was there, after the fact.
 * - `restore` undoes a `remove`: the rows come back with their own ids and
 *   dates, for {@link DRINK_LOG_RESTORE_WINDOW_MS}, to whoever removed them.
 * - `suggestFlavourTags` touches no row: it reads a note and answers words. It
 *   lives here because the sheet that asks has already minted this actor's id.
 */
export type CheckInActorInterface = {
  log(ctx: Ctx, input: LogDrinkInput): Promise<LoggedDrinkDto>;
  get(ctx: Ctx): Promise<ItemCheckInDto>;
  update(ctx: Ctx, input: UpdateDrinkLogInput): Promise<ItemCheckInDto>;
  setCompanions(
    ctx: Ctx,
    input: SetDrinkLogCompanionsInput,
  ): Promise<ItemCheckInDto>;
  remove(ctx: Ctx): Promise<RemovedCheckIns>;
  restore(ctx: Ctx): Promise<RestoredCheckIns>;
  suggestFlavourTags(
    ctx: Ctx,
    input: SuggestFlavourTagsInput,
  ): Promise<FlavourTagSuggestionDto>;
};

export const CheckInActorDescriptor: ActorDescriptor<CheckInActorInterface> = {
  actorType: "CheckInActor",
  category: "entity",
  methods: {
    log: {},
    get: {},
    update: {},
    setCompanions: {},
    remove: {},
    restore: {},
    suggestFlavourTags: { modelBacked: true },
  },
};
