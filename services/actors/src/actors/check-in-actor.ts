/**
 * `CheckInActor(checkInId)` — X02, the drink log's writer.
 *
 * Owns `check_ins` (`packages/db/src/writers.ts`). Before X02 the table was
 * `CellarActor`'s: a check-in was a timestamp on a bottle, deleted with it. A
 * log entry is about an **item** now, and the bottle is an optional detail —
 * so it cannot live in an aggregate keyed by cellar. `CellarActor` still reads
 * the rows that point at its bottles (fresh, per call), and removing a bottle
 * nulls their `cellar_item_id` through the foreign key: the history survives.
 *
 * ## The aggregate: one row, plus its occasion's roster
 *
 * Keyed by the row id, which the caller mints — the idempotency key (§8.4): a
 * retried `log` with the same id answers the rows it already wrote instead of
 * writing a second drink. The aggregate is that row plus the `(id, user_id,
 * created_by_id)` of every row in the same occasion (`group_id`), which is
 * what "with Sam" and the companion branch of `canSeeCheckIn` are read from.
 *
 * ## Companions write rows about other people — on purpose, as before
 *
 * `bulkCheckIn` already wrote one row per drinker, each *about* that drinker,
 * and a log with companions does the same in one transaction. Every companion
 * must be a friend of the logger (the old rule), and companion rows carry the
 * occasion — item, bottle, place, time — but never the logger's score, note,
 * tags or photo, which are one person's opinion. The keyed row is the
 * logger's own (or, for a round logged for friends only, the first friend's),
 * and its id is the occasion's `group_id`.
 *
 * ## Who may do what (`@cellar-assistant/policy`)
 *
 * - **see** — `canSeeCheckIn`: the drinker, a companion, a friend of the
 *   drinker, or anyone who can see the cellar the bottle is still in. Anyone
 *   else gets `NotFound`, the same answer as a row that does not exist.
 * - **edit** — `canEditCheckIn`: the drinker only.
 * - **remove** — `canRemoveCheckIn`: the drinker, or whoever wrote the row.
 *   Removing the keyed row of an occasion you wrote removes the companion rows
 *   you wrote with it, which is what Undo after logging a table's round needs.
 *
 * ## The log's score is not the review
 *
 * Nothing here reads or writes `item_reviews`. A ★3 on Tuesday's glass does
 * not move the ★4.5 the drinker gave the wine (D5).
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  CheckInActorInterface,
  CheckInBottleRef,
  Ctx,
  FlavourTagSuggestionDto,
  ItemCheckInDto,
  ItemRef,
  LogDrinkInput,
  LoggedDrinkDto,
  RemovedCheckIns,
  SuggestFlavourTagsInput,
  UpdateDrinkLogInput,
} from "@cellar-assistant/contracts";
import {
  CheckInActorDescriptor,
  ConflictError,
  ForbiddenError,
  isCheckInScore,
  isItemType,
  MAX_CHECK_IN_DRINKERS,
  MAX_CHECK_IN_NOTE_LENGTH,
  NotFoundError,
  normaliseCheckInTags,
  ValidationError,
} from "@cellar-assistant/contracts";
import { cellarItems, checkIns, files, places } from "@cellar-assistant/db";
import { and, asc, eq, inArray } from "@cellar-assistant/db/orm";
import {
  canEditCheckIn,
  canRemoveCheckIn,
  canSeeCellar,
  canSeeCheckIn,
  isFriend,
} from "@cellar-assistant/policy";
import { EntityActorBase } from "../lib/actor-base.ts";
import { flavourTagSuggester } from "../lib/flavour-tags.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { itemNames } from "../lib/item-names.ts";
import { requireUuid } from "../lib/uuid.ts";
import {
  cellarVisibility,
  friendshipsOf,
  loadCellarAccess,
  policyFriendships,
} from "../lib/visibility.ts";

type CheckInRow = typeof checkIns.$inferSelect;

type RosterRow = {
  readonly id: string;
  readonly userId: string;
  readonly createdById: string;
};

export type CheckInAggregate = {
  readonly row: CheckInRow;
  /** Every row of the occasion, this one included, oldest first. */
  readonly roster: readonly RosterRow[];
};

const ARC = ARCS.checkIns;

export class CheckInActor
  extends EntityActorBase<CheckInAggregate>
  implements CheckInActorInterface
{
  static readonly category: ActorCategory = CheckInActorDescriptor.category;

  protected async loadAggregate(id: string): Promise<CheckInAggregate | null> {
    const [row] = await this.db
      .select()
      .from(checkIns)
      .where(eq(checkIns.id, id));
    if (row === undefined) return null;
    const roster = await this.db
      .select({
        id: checkIns.id,
        userId: checkIns.userId,
        createdById: checkIns.createdById,
      })
      .from(checkIns)
      .where(eq(checkIns.groupId, row.groupId))
      .orderBy(asc(checkIns.createdAt), asc(checkIns.id));
    return { row, roster };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<ItemCheckInDto> {
    const aggregate = await this.requireVisible(ctx);
    return toEntryDto(aggregate, ctx.viewerId);
  }

  /* ---------------------------------------------------------------------- */
  /* Writes                                                                  */
  /* ---------------------------------------------------------------------- */

  async log(ctx: Ctx, input: LogDrinkInput): Promise<LoggedDrinkDto> {
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to log a drink");

    // §8.4: the row id is the idempotency key. A retry by the writer answers
    // what it wrote; anybody else naming this id learns nothing new — absent
    // if they cannot see it, "not yours" if they can.
    const existing = this.aggregate;
    if (existing !== null) {
      await this.requireAllowed(
        ctx,
        existing.row.createdById === viewer,
        `check-in ${this.key} was logged by someone else`,
        existing,
      );
      return this.#logged(existing, viewer);
    }

    const companions = await this.#requireCompanions(ctx, viewer, input);
    const includeSelf =
      (input.includeSelf ?? true) || companions.includesViewer;
    const drinkers = includeSelf
      ? [viewer, ...companions.ids]
      : [...companions.ids];
    if (drinkers.length === 0) {
      throw new ValidationError(
        "a log needs a drinker: include yourself, or name a friend",
      );
    }
    if (drinkers.length > MAX_CHECK_IN_DRINKERS) {
      throw new ValidationError(
        `a log takes at most ${MAX_CHECK_IN_DRINKERS} drinkers, got ${drinkers.length}`,
      );
    }

    const opinion = {
      score: requireScore(input.score),
      note: requireNote(input.note),
      tags: normaliseCheckInTags(input.tags ?? []),
      photoFileId: await this.#requirePhoto(viewer, input.photoFileId),
    };
    if (
      !includeSelf &&
      (opinion.score !== null ||
        opinion.note !== null ||
        opinion.tags.length > 0 ||
        opinion.photoFileId !== null)
    ) {
      throw new ValidationError(
        "a score, note, tags or photo are the drinker's own; log a round for " +
          "friends without them, or include yourself",
      );
    }

    const placeId = await this.#requirePlace(input.placeId);
    const { item, cellarItemId } = await this.#requireSubject(ctx, input);

    const groupId = this.key;
    const now = new Date();
    const rows = drinkers.map((userId, index) => ({
      id: index === 0 ? groupId : randomUUID(),
      userId,
      createdById: viewer,
      groupId,
      cellarItemId,
      ...ARC.values(item),
      placeId,
      // The opinion belongs to the viewer's own row and to no one else's.
      ...(includeSelf && index === 0
        ? opinion
        : { score: null, note: null, tags: [], photoFileId: null }),
      createdAt: now,
      updatedAt: now,
    }));

    await this.tx(async (tx) => {
      await tx
        .insert(checkIns)
        .values(rows)
        .onConflictDoNothing({ target: checkIns.id });
    });
    await this.reload();
    const written = this.aggregate;
    if (written === null || written.row.createdById !== viewer) {
      throw new ConflictError(`check-in ${groupId} was not written`);
    }
    return this.#logged(written, viewer);
  }

  async update(ctx: Ctx, input: UpdateDrinkLogInput): Promise<ItemCheckInDto> {
    const aggregate = this.requireAggregate();
    const viewer = ctx.viewerId;
    await this.requireAllowed(
      ctx,
      canEditCheckIn(ctx, aggregate.row),
      "only the drinker can change this log",
      aggregate,
    );

    const patch: Partial<typeof checkIns.$inferInsert> = {};
    if (input.score !== undefined) patch.score = requireScore(input.score);
    if (input.note !== undefined) patch.note = requireNote(input.note);
    if (input.tags !== undefined) {
      patch.tags = normaliseCheckInTags(input.tags ?? []);
    }
    if (input.placeId !== undefined) {
      patch.placeId = await this.#requirePlace(input.placeId);
    }
    if (input.photoFileId !== undefined) {
      if (viewer === null) throw new ForbiddenError("sign in to add a photo");
      patch.photoFileId = await this.#requirePhoto(viewer, input.photoFileId);
    }
    if (Object.keys(patch).length === 0) {
      return toEntryDto(aggregate, viewer);
    }

    await this.tx(async (tx) => {
      await tx
        .update(checkIns)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(checkIns.id, this.key));
    });
    await this.reload();
    return toEntryDto(this.requireAggregate(), viewer);
  }

  async remove(ctx: Ctx): Promise<RemovedCheckIns> {
    const aggregate = this.requireAggregate();
    const { row } = aggregate;
    await this.requireAllowed(
      ctx,
      canRemoveCheckIn(ctx, row),
      "only the drinker or whoever logged it can remove this",
      aggregate,
    );

    // Undo of an occasion: its writer removing the keyed row takes the
    // companion rows they wrote with it. A companion removing their own row
    // ("I wasn't there") takes only theirs.
    const viewer = ctx.viewerId;
    const ids =
      row.id === row.groupId && viewer !== null && row.createdById === viewer
        ? aggregate.roster
            .filter((other) => other.createdById === viewer)
            .map((other) => other.id)
        : [row.id];
    const ordered = [row.id, ...ids.filter((id) => id !== row.id)];

    await this.tx(async (tx) => {
      await tx.delete(checkIns).where(inArray(checkIns.id, ordered));
    });
    this.setAggregate(null);
    return { ids: ordered };
  }

  async suggestFlavourTags(
    ctx: Ctx,
    input: SuggestFlavourTagsInput,
  ): Promise<FlavourTagSuggestionDto> {
    if (ctx.viewerId === null) {
      throw new ForbiddenError("sign in to get flavour suggestions");
    }
    if (typeof input.itemType !== "string" || !isItemType(input.itemType)) {
      throw new ValidationError(
        `unknown item type ${JSON.stringify(input.itemType)}`,
      );
    }
    const note = requireNote(input.note) ?? "";
    const existing = Array.isArray(input.existing)
      ? input.existing.map(String)
      : [];
    return await flavourTagSuggester()(ctx, {
      note,
      itemType: input.itemType,
      existing,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /** `canSeeCheckIn`, with each of its flags read fresh for this turn. */
  protected override async canSee(
    ctx: Ctx,
    aggregate: CheckInAggregate,
  ): Promise<boolean> {
    const { row, roster } = aggregate;
    const viewer = ctx.viewerId;
    const friendships = await policyFriendships(this.db, ctx);
    return canSeeCheckIn(ctx, {
      userId: row.userId,
      viewerIsFriendOfCheckInUser: isFriend(ctx, row.userId, friendships),
      viewerIsCompanion:
        viewer !== null && roster.some((other) => other.userId === viewer),
      cellar: await this.#cellarOf(ctx, row.cellarItemId),
    });
  }

  async #cellarOf(ctx: Ctx, cellarItemId: string | null) {
    if (cellarItemId === null) return null;
    const [bottle] = await this.db
      .select({ cellarId: cellarItems.cellarId })
      .from(cellarItems)
      .where(eq(cellarItems.id, cellarItemId));
    if (bottle === undefined) return null;
    const access = await loadCellarAccess(this.db, bottle.cellarId);
    return access === null ? null : cellarVisibility(this.db, ctx, access);
  }

  #logged(aggregate: CheckInAggregate, viewer: string): LoggedDrinkDto {
    const written = aggregate.roster.filter(
      (other) => other.createdById === aggregate.row.createdById,
    );
    const rows = [
      { id: aggregate.row.id, userId: aggregate.row.userId },
      ...written
        .filter((other) => other.id !== aggregate.row.id)
        .map((other) => ({ id: other.id, userId: other.userId })),
    ];
    return {
      entry: toEntryDto(aggregate, viewer),
      rows,
      cellarItemId: aggregate.row.cellarItemId,
    };
  }

  /**
   * The friends named as companions — canonical, deduplicated, the viewer
   * filtered out (and remembered: naming yourself means you drank too). One
   * that is not a friend rejects the whole call before anything is written.
   */
  async #requireCompanions(
    ctx: Ctx,
    viewer: string,
    input: LogDrinkInput,
  ): Promise<{ ids: string[]; includesViewer: boolean }> {
    const raw = input.companionIds ?? [];
    if (!Array.isArray(raw)) {
      throw new ValidationError("companionIds must be a list of user ids");
    }
    const unique = [
      ...new Set(raw.map((id) => requireUuid(id, "companionIds[]"))),
    ];
    const includesViewer = unique.includes(viewer);
    const ids = unique.filter((id) => id !== viewer);
    if (ids.length === 0) return { ids, includesViewer };
    const friendships = await friendshipsOf(this.db, viewer);
    for (const id of ids) {
      if (!isFriend(ctx, id, friendships)) {
        throw new ForbiddenError(
          `cannot log a drink on behalf of ${id}: not a friend`,
        );
      }
    }
    return { ids, includesViewer };
  }

  /**
   * What was drunk, and from which bottle. A bottle is checked the way
   * `CellarActor.checkIn` checked it: the cellar must be visible to the
   * viewer (an invisible one is `NotFound`, never `Forbidden`), and the bottle
   * must be in it. The item is read off the bottle; one passed as well must
   * agree with it.
   */
  async #requireSubject(
    ctx: Ctx,
    input: LogDrinkInput,
  ): Promise<{ item: ItemRef; cellarItemId: string | null }> {
    const named =
      input.item === null || input.item === undefined
        ? null
        : requireItemRef(input.item);
    const bottle = input.bottle ?? null;
    if (bottle === null) {
      if (named === null) {
        throw new ValidationError("a log needs an item or a bottle");
      }
      const found = await itemNames(this.db, [named]);
      if (!found.has(named.id)) {
        throw new NotFoundError(`${named.type} ${named.id} not found`);
      }
      return { item: named, cellarItemId: null };
    }
    const fromBottle = await this.#requireBottle(ctx, bottle);
    if (
      named !== null &&
      (named.type !== fromBottle.item.type || named.id !== fromBottle.item.id)
    ) {
      throw new ValidationError(
        "the item does not match the bottle it was poured from",
      );
    }
    return fromBottle;
  }

  async #requireBottle(
    ctx: Ctx,
    bottle: CheckInBottleRef,
  ): Promise<{ item: ItemRef; cellarItemId: string }> {
    const cellarId = requireUuid(bottle.cellarId, "bottle.cellarId");
    const cellarItemId = requireUuid(
      bottle.cellarItemId,
      "bottle.cellarItemId",
    );
    const absent = new NotFoundError(
      `cellar_item ${cellarItemId} is not in cellar ${cellarId}`,
    );
    const access = await loadCellarAccess(this.db, cellarId);
    if (access === null) throw absent;
    if (!canSeeCellar(ctx, await cellarVisibility(this.db, ctx, access))) {
      throw absent;
    }
    const [row] = await this.db
      .select()
      .from(cellarItems)
      .where(
        and(
          eq(cellarItems.id, cellarItemId),
          eq(cellarItems.cellarId, cellarId),
        ),
      );
    if (row === undefined) throw absent;
    return { item: ARCS.cellarItems.requireRefOf(row), cellarItemId: row.id };
  }

  async #requirePlace(
    placeId: string | null | undefined,
  ): Promise<string | null> {
    if (placeId === null || placeId === undefined) return null;
    const id = requireUuid(placeId, "placeId");
    const [place] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(eq(places.id, id));
    if (place === undefined) throw new NotFoundError(`place ${id} not found`);
    return place.id;
  }

  /**
   * A photo is a verified upload of the viewer's own. Somebody else's file id
   * is answered exactly like a missing one — `files` rows are private to
   * their uploader (`FileActor.canSee`).
   */
  async #requirePhoto(
    viewer: string,
    photoFileId: string | null | undefined,
  ): Promise<string | null> {
    if (photoFileId === null || photoFileId === undefined) return null;
    const id = requireUuid(photoFileId, "photoFileId");
    const [file] = await this.db
      .select({
        id: files.id,
        uploadedBy: files.uploadedBy,
        verifiedAt: files.verifiedAt,
      })
      .from(files)
      .where(eq(files.id, id));
    if (file === undefined || file.uploadedBy !== viewer) {
      throw new NotFoundError(`file ${id} not found`);
    }
    if (file.verifiedAt === null) {
      throw new ConflictError(
        `file ${id} is not verified yet — finish the upload first`,
      );
    }
    return file.id;
  }
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

const requireItemRef = (item: ItemRef): ItemRef => {
  if (typeof item.type !== "string" || !isItemType(item.type)) {
    throw new ValidationError(`unknown item type ${JSON.stringify(item.type)}`);
  }
  return { type: item.type, id: requireUuid(item.id, "item.id") };
};

const requireScore = (score: number | null | undefined): number | null => {
  if (score === null || score === undefined) return null;
  if (typeof score !== "number" || !isCheckInScore(score)) {
    throw new ValidationError(
      `a log's score is half stars from 0.5 to 5, got ${String(score)}`,
    );
  }
  return score;
};

const requireNote = (note: string | null | undefined): string | null => {
  if (note === null || note === undefined) return null;
  const trimmed = String(note).trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_CHECK_IN_NOTE_LENGTH) {
    throw new ValidationError(
      `a note must be ${MAX_CHECK_IN_NOTE_LENGTH} characters or less`,
    );
  }
  return trimmed;
};

/** `lib/check-in-rows.ts`'s `toItemCheckInDto`, for a Drizzle row. */
export const toEntryDto = (
  aggregate: CheckInAggregate,
  viewerId: string | null,
): ItemCheckInDto => {
  const { row, roster } = aggregate;
  return {
    id: row.id,
    userId: row.userId,
    createdById: row.createdById,
    item: ARC.requireRefOf(row),
    score: row.score,
    note: row.note,
    tags: row.tags,
    placeId: row.placeId,
    photoFileId: row.photoFileId,
    companionIds: roster
      .filter((other) => other.id !== row.id && other.userId !== row.userId)
      .map((other) => other.userId),
    fromCellar: row.cellarItemId !== null && viewerId === row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};
