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
 * - **see what was said** — `canSeeCheckInDetails`: the drinker, a
 *   companion, a friend. A viewer admitted only by the bottle's cellar gets
 *   the entry without its score, note, tags, place, photo or companions.
 * - **remove** — `canRemoveCheckIn`: the drinker, or whoever wrote the row
 *   while the drinker has not added to it. Removing the keyed row of an
 *   occasion you wrote removes the companion rows you wrote with it — the
 *   untouched ones — which is what Undo after logging a table's round needs.
 *
 * ## The log's score is not the review
 *
 * Nothing here reads or writes `item_reviews`. A ★3 on Tuesday's glass does
 * not move the ★4.5 the drinker gave the wine (D5).
 *
 * ## After the fact (X03's drink-log follow-ups)
 *
 * - **When** — `created_at` is when it was drunk, and a log may be backdated
 *   (`drankAt`, `parseDrankAt`). Re-dating the entry you logged for a table
 *   moves the companions' entries you wrote with it, the same set Undo takes.
 * - **Who with** — `setCompanions` replaces the occasion's roster: a friend
 *   added gets a row about them; one dropped loses the row you wrote, unless
 *   they have made it theirs (`checkInIsClaimed`), which is a `ConflictError`.
 * - **Undo of a delete** — `remove` copies every row it deletes into
 *   `check_in_trash` in the same transaction, and `restore` (keyed by the
 *   same id) puts them back with their own ids and dates for
 *   `DRINK_LOG_RESTORE_WINDOW_MS`. Whatever a row pointed at that has gone
 *   meanwhile (a bottle, a place, a photo) comes back as null; a companion
 *   who is no longer your friend does not come back.
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
  DRINK_LOG_RESTORE_WINDOW_MS,
  ForbiddenError,
  isCheckInScore,
  isItemType,
  MAX_CHECK_IN_DRINKERS,
  MAX_CHECK_IN_NOTE_LENGTH,
  NotFoundError,
  normaliseCheckInTags,
  parseDrankAt,
  type RestoredCheckIns,
  type SetDrinkLogCompanionsInput,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  cellarItems,
  checkIns,
  checkInTrash,
  files,
  places,
  user,
} from "@cellar-assistant/db";
import { and, asc, eq, gt, inArray, lt, sql } from "@cellar-assistant/db/orm";
import {
  canEditCheckIn,
  canRemoveCheckIn,
  canSeeCellar,
  canSeeCheckIn,
  canSeeCheckInDetails,
  checkInIsClaimed,
  isFriend,
} from "@cellar-assistant/policy";
import { EntityActorBase } from "../lib/actor-base.ts";
import { withoutDetails } from "../lib/check-in-rows.ts";
import { flavourTagSuggester } from "../lib/flavour-tags.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { itemNames } from "../lib/item-names.ts";
import { placeIsVisible } from "../lib/unshared-places.ts";
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
  /** `checkInIsClaimed`: the drinker has added a score, note, tags or photo. */
  readonly claimed: boolean;
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
    const others = await this.db
      .select({
        id: checkIns.id,
        userId: checkIns.userId,
        createdById: checkIns.createdById,
        score: checkIns.score,
        note: checkIns.note,
        tags: checkIns.tags,
        photoFileId: checkIns.photoFileId,
      })
      .from(checkIns)
      .where(eq(checkIns.groupId, row.groupId))
      .orderBy(asc(checkIns.createdAt), asc(checkIns.id));
    const roster = others.map((other) => ({
      id: other.id,
      userId: other.userId,
      createdById: other.createdById,
      claimed: checkInIsClaimed(other),
    }));
    return { row, roster };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<ItemCheckInDto> {
    const aggregate = await this.requireVisible(ctx);
    const entry = await this.#placeSeenBy(
      ctx,
      toEntryDto(aggregate, ctx.viewerId),
    );
    return canSeeCheckInDetails(ctx, await this.#personal(ctx, aggregate))
      ? entry
      : withoutDetails(entry);
  }

  /**
   * The entry with its place dropped when `ctx` may not see that place: a
   * place under review is its creator's alone (X27 / D28), and a companion's
   * row carries the logger's place. Same rule as `checkInColumns`.
   */
  async #placeSeenBy(ctx: Ctx, entry: ItemCheckInDto): Promise<ItemCheckInDto> {
    if (entry.placeId === null) return entry;
    return (await placeIsVisible(this.db, ctx, entry.placeId))
      ? entry
      : { ...entry, placeId: null };
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

    const placeId = await this.#requirePlace(ctx, input.placeId);
    const { item, cellarItemId } = await this.#requireSubject(ctx, input);

    const groupId = this.key;
    const now = new Date();
    const drankAt = parseDrankAt(input.drankAt, now);
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
      createdAt: drankAt,
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
      patch.placeId = await this.#requirePlace(ctx, input.placeId);
    }
    if (input.photoFileId !== undefined) {
      if (viewer === null) throw new ForbiddenError("sign in to add a photo");
      patch.photoFileId = await this.#requirePhoto(viewer, input.photoFileId);
    }
    const now = new Date();
    const drankAt =
      input.drankAt === undefined ? null : parseDrankAt(input.drankAt, now);
    if (Object.keys(patch).length === 0 && drankAt === null) {
      return await this.#placeSeenBy(ctx, toEntryDto(aggregate, viewer));
    }

    // Re-dating the entry you logged for a table re-dates the occasion: the
    // companions' rows you wrote with it that are still yours to change.
    const redated =
      drankAt === null
        ? []
        : this.#writtenWithIt(ctx, aggregate).filter((id) => id !== this.key);
    await this.tx(async (tx) => {
      await tx
        .update(checkIns)
        .set({
          ...patch,
          ...(drankAt === null ? {} : { createdAt: drankAt }),
          updatedAt: now,
        })
        .where(eq(checkIns.id, this.key));
      if (drankAt !== null && redated.length > 0) {
        await tx
          .update(checkIns)
          .set({ createdAt: drankAt, updatedAt: now })
          .where(inArray(checkIns.id, redated));
      }
    });
    await this.reload();
    return await this.#placeSeenBy(
      ctx,
      toEntryDto(this.requireAggregate(), viewer),
    );
  }

  async remove(ctx: Ctx): Promise<RemovedCheckIns> {
    const aggregate = this.requireAggregate();
    const { row } = aggregate;
    await this.requireAllowed(
      ctx,
      canRemoveCheckIn(ctx, {
        userId: row.userId,
        createdById: row.createdById,
        claimedByDrinker: checkInIsClaimed(row),
      }),
      row.createdById === ctx.viewerId
        ? "this entry is the drinker's now — they added to it, so only they can remove it"
        : "only the drinker or whoever logged it can remove this",
      aggregate,
    );

    // Undo of an occasion: its writer removing the keyed row takes the
    // companion rows they wrote with it — each one `canRemoveCheckIn` still
    // allows, so a friend who has since scored or noted their glass keeps it.
    // A companion removing their own row ("I wasn't there") takes only theirs.
    const ids = this.#writtenWithIt(ctx, aggregate);
    const ordered = [row.id, ...ids.filter((id) => id !== row.id)];
    const viewer = ctx.viewerId;

    await this.tx(async (tx) => {
      const removed = await tx
        .select()
        .from(checkIns)
        .where(inArray(checkIns.id, ordered));
      // The Undo (`restore`): every removed row, as it was, for the window.
      // Expired trash goes on the way past — no sweeper to schedule.
      await tx
        .delete(checkInTrash)
        .where(
          lt(
            checkInTrash.removedAt,
            new Date(Date.now() - DRINK_LOG_RESTORE_WINDOW_MS),
          ),
        );
      if (viewer !== null && removed.length > 0) {
        await tx
          .insert(checkInTrash)
          .values(
            removed.map((gone) => ({
              id: gone.id,
              removalId: this.key,
              removedById: viewer,
              row: toTrashRow(gone),
            })),
          )
          .onConflictDoUpdate({
            target: checkInTrash.id,
            set: {
              removalId: this.key,
              removedById: viewer,
              removedAt: new Date(),
              row: sql`excluded.row`,
            },
          });
      }
      await tx.delete(checkIns).where(inArray(checkIns.id, ordered));
    });
    this.setAggregate(null);
    return { ids: ordered };
  }

  /**
   * Who else was there, after the fact. Only on your own entry of an
   * occasion you logged; `companionIds` is the whole new set.
   */
  async setCompanions(
    ctx: Ctx,
    input: SetDrinkLogCompanionsInput,
  ): Promise<ItemCheckInDto> {
    const aggregate = this.requireAggregate();
    const { row, roster } = aggregate;
    const viewer = ctx.viewerId;
    await this.requireAllowed(
      ctx,
      viewer !== null && row.userId === viewer && row.createdById === viewer,
      "only the person who logged this drink can change who was there",
      aggregate,
    );
    if (viewer === null) throw new ForbiddenError("sign in to edit a log");

    const wanted = await this.#requireCompanions(ctx, viewer, {
      companionIds: input.companionIds,
    });
    const present = roster.filter((other) => other.id !== row.id);
    const presentUsers = new Set(present.map((other) => other.userId));
    const added = wanted.ids.filter((id) => !presentUsers.has(id));
    const dropped = present.filter(
      (other) => other.userId !== viewer && !wanted.ids.includes(other.userId),
    );
    const kept = dropped.filter(
      (other) =>
        !canRemoveCheckIn(ctx, {
          userId: other.userId,
          createdById: other.createdById,
          claimedByDrinker: other.claimed,
        }),
    );
    if (kept.length > 0) {
      throw new ConflictError(
        kept.length === 1
          ? "one of them has added to their own entry, so it is theirs now and stays"
          : `${kept.length} of them have added to their own entries, so those are theirs now and stay`,
      );
    }
    const drinkers = roster.length - dropped.length + added.length;
    if (drinkers > MAX_CHECK_IN_DRINKERS) {
      throw new ValidationError(
        `a log takes at most ${MAX_CHECK_IN_DRINKERS} drinkers, got ${drinkers}`,
      );
    }
    if (added.length === 0 && dropped.length === 0) {
      return await this.#placeSeenBy(ctx, toEntryDto(aggregate, viewer));
    }

    const item = ARC.requireRefOf(row);
    const now = new Date();
    await this.tx(async (tx) => {
      if (dropped.length > 0) {
        await tx.delete(checkIns).where(
          inArray(
            checkIns.id,
            dropped.map((other) => other.id),
          ),
        );
      }
      if (added.length > 0) {
        await tx.insert(checkIns).values(
          added.map((userId) => ({
            id: randomUUID(),
            userId,
            createdById: viewer,
            groupId: row.groupId,
            cellarItemId: row.cellarItemId,
            ...ARC.values(item),
            placeId: row.placeId,
            score: null,
            note: null,
            tags: [],
            photoFileId: null,
            // The occasion's own time, not the moment of the edit.
            createdAt: row.createdAt,
            updatedAt: now,
          })),
        );
      }
    });
    await this.reload();
    return await this.#placeSeenBy(
      ctx,
      toEntryDto(this.requireAggregate(), viewer),
    );
  }

  /**
   * Undo of `remove`: the rows it took, back with their own ids and dates,
   * for whoever removed them, within {@link DRINK_LOG_RESTORE_WINDOW_MS}.
   */
  async restore(ctx: Ctx): Promise<RestoredCheckIns> {
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to undo");
    const since = new Date(Date.now() - DRINK_LOG_RESTORE_WINDOW_MS);
    const trashed = await this.db
      .select()
      .from(checkInTrash)
      .where(
        and(
          eq(checkInTrash.removalId, this.key),
          eq(checkInTrash.removedById, viewer),
          gt(checkInTrash.removedAt, since),
        ),
      );
    if (trashed.length === 0) {
      // Never removed, someone else's removal, already restored, or too old:
      // one answer, so this is no oracle for somebody else's log.
      throw new NotFoundError(`check-in ${this.key} has nothing to undo`);
    }

    const rows = trashed.map((entry) => fromTrashRow(entry.row));
    const friendships = await friendshipsOf(this.db, viewer);
    const restorable = rows.filter(
      (gone) =>
        gone.userId === viewer ||
        gone.createdById !== viewer ||
        isFriend(ctx, gone.userId, friendships),
    );
    const keyed = restorable.find((gone) => gone.id === this.key);
    if (keyed === undefined) {
      throw new ConflictError(`check-in ${this.key} can no longer be restored`);
    }

    // What a row pointed at may have gone since: the bottle (removed or
    // finished and deleted), the place, the photo. The log outlives them, as
    // it would have had it never been removed.
    const existing = async <T extends { id: string }>(
      ids: readonly (string | null)[],
      lookup: (present: string[]) => Promise<T[]>,
    ): Promise<Set<string>> => {
      const wanted = [
        ...new Set(ids.filter((id): id is string => id !== null)),
      ];
      if (wanted.length === 0) return new Set();
      return new Set((await lookup(wanted)).map((found) => found.id));
    };
    const bottles = await existing(
      restorable.map((gone) => gone.cellarItemId),
      (ids) =>
        this.db
          .select({ id: cellarItems.id })
          .from(cellarItems)
          .where(inArray(cellarItems.id, ids)),
    );
    const placesFound = await existing(
      restorable.map((gone) => gone.placeId),
      (ids) =>
        this.db
          .select({ id: places.id })
          .from(places)
          .where(inArray(places.id, ids)),
    );
    const photos = await existing(
      restorable.map((gone) => gone.photoFileId),
      (ids) =>
        this.db
          .select({ id: files.id })
          .from(files)
          .where(inArray(files.id, ids)),
    );
    const people = await existing(
      restorable.flatMap((gone) => [gone.userId, gone.createdById]),
      (ids) =>
        this.db.select({ id: user.id }).from(user).where(inArray(user.id, ids)),
    );
    const values = restorable
      .filter((gone) => people.has(gone.userId) && people.has(gone.createdById))
      .map((gone) => ({
        ...gone,
        cellarItemId:
          gone.cellarItemId !== null && bottles.has(gone.cellarItemId)
            ? gone.cellarItemId
            : null,
        placeId:
          gone.placeId !== null && placesFound.has(gone.placeId)
            ? gone.placeId
            : null,
        photoFileId:
          gone.photoFileId !== null && photos.has(gone.photoFileId)
            ? gone.photoFileId
            : null,
      }));
    const ids = [
      this.key,
      ...values.map((gone) => gone.id).filter((id) => id !== this.key),
    ];

    await this.tx(async (tx) => {
      if (values.length > 0) {
        await tx
          .insert(checkIns)
          .values(values)
          .onConflictDoNothing({ target: checkIns.id });
      }
      await tx.delete(checkInTrash).where(eq(checkInTrash.removalId, this.key));
    });
    await this.reload();
    const aggregate = this.requireAggregate();
    return {
      ids,
      entry: await this.#placeSeenBy(ctx, toEntryDto(aggregate, viewer)),
    };
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

  /**
   * The rows that go with this one when it is removed or re-dated: for the
   * writer of an occasion acting on its keyed row, every row of it they wrote
   * that `canRemoveCheckIn` still allows (a friend who has since scored or
   * noted their glass keeps it); otherwise this row alone.
   */
  #writtenWithIt(ctx: Ctx, aggregate: CheckInAggregate): string[] {
    const { row, roster } = aggregate;
    const viewer = ctx.viewerId;
    if (
      row.id !== row.groupId ||
      viewer === null ||
      row.createdById !== viewer
    ) {
      return [row.id];
    }
    return roster
      .filter(
        (other) =>
          other.createdById === viewer &&
          canRemoveCheckIn(ctx, {
            userId: other.userId,
            createdById: other.createdById,
            claimedByDrinker: other.claimed,
          }),
      )
      .map((other) => other.id);
  }

  /** `canSeeCheckIn`, with each of its flags read fresh for this turn. */
  protected override async canSee(
    ctx: Ctx,
    aggregate: CheckInAggregate,
  ): Promise<boolean> {
    return canSeeCheckIn(ctx, {
      ...(await this.#personal(ctx, aggregate)),
      cellar: await this.#cellarOf(ctx, aggregate.row.cellarItemId),
    });
  }

  /** The flags of `canSeeCheckIn`'s personal branches (and of its details). */
  async #personal(ctx: Ctx, aggregate: CheckInAggregate) {
    const { row, roster } = aggregate;
    const viewer = ctx.viewerId;
    const friendships = await policyFriendships(this.db, ctx);
    return {
      userId: row.userId,
      viewerIsFriendOfCheckInUser: isFriend(ctx, row.userId, friendships),
      viewerIsCompanion:
        viewer !== null && roster.some((other) => other.userId === viewer),
    };
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

  /**
   * A place the writer may see: shared, or their own still under review
   * (X27 / D28). Somebody else's unshared place is answered exactly like a
   * missing one, so `placeId` is no existence oracle.
   */
  async #requirePlace(
    ctx: Ctx,
    placeId: string | null | undefined,
  ): Promise<string | null> {
    if (placeId === null || placeId === undefined) return null;
    const id = requireUuid(placeId, "placeId");
    if (!(await placeIsVisible(this.db, ctx, id))) {
      throw new NotFoundError(`place ${id} not found`);
    }
    return id;
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

/** A removed row as `check_in_trash.row` keeps it: JSON, instants as ISO. */
export const toTrashRow = (row: CheckInRow): Record<string, unknown> => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** `check_in_trash.row` back into an insertable `check_ins` row. */
export const fromTrashRow = (value: unknown): CheckInRow => {
  const raw = value as Record<string, unknown> & {
    createdAt: string;
    updatedAt: string;
  };
  return {
    ...(raw as unknown as CheckInRow),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
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
