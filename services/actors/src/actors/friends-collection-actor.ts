/**
 * `FriendsCollectionActor(viewerId)` — C3 (migration plan §2.2, §1.5).
 *
 * > | `FriendsCollectionActor(viewerId)` | `/friends`: friends,
 * > incoming/outgoing requests | ids + request rows |
 *
 * §2.2's "ids **+** request rows" is two methods with two different answers to
 * §1.5's question, and both are the right one for their half:
 *
 * - **`friends` returns ids.** The interesting thing about a friend is their
 *   profile, and a profile is an entity-actor read (`UserActor.getProfile`).
 *   So the page is `{ userId, since }` — `since` being the only column a
 *   `friends` row has that is not one of the two user ids — and `services/api`
 *   hydrates the ids through the `UserProfile` DataLoader in one batch.
 *   B4's `UserActor.friends` inlines the profile instead, which is an N+1
 *   *inside* the actor turn; this is the same list without it.
 * - **`requests` returns a projection.** A `friend_requests` row has no entity
 *   actor: §3 makes `UserActor` its writer and only the *requester's* actor may
 *   write it, so there is no per-request actor a DataLoader could address. The
 *   row's four fields come back whole; only `otherUserId` is an id.
 *
 * ## Both directions are read, and the result is deduplicated
 *
 * `friends` is directed — one row per direction — and §1.7 makes acceptance two
 * idempotent calls with an outbox row between them, so **for the width of that
 * window only one of the two rows exists**. B4's outcome note says a
 * one-directional read would flicker "not friends"; `visibility.ts` says
 * the same. So this reads both directions.
 *
 * That means the *steady* state has two rows per friendship, which would list
 * each friend twice. The union is therefore grouped by the other user id and
 * keyed on `max(created_at)`, which both deduplicates and gives the keyset a
 * genuinely unique second component — the friendship, not the row.
 *
 * ## Authorization
 *
 * `friends` and `friend_requests` are visible only to the two people named in
 * them (today's Hasura rule, and B4's `#requireSelf`). Every row this actor can
 * reach names its own viewer, so the per-turn `ctx.viewerId === this.key` check
 * in `ViewerCollectionActorBase` *is* the authorization — which is why it runs
 * before anything else, on every turn, and cannot be skipped by a warm
 * activation (§1.5, C1).
 */
import type {
  ActivityEntryDto,
  ActivityFeedCursor,
  ActivityFilter,
  ActivityKind,
  ActorCategory,
  Ctx,
  FriendEdgeDto,
  FriendProfileDto,
  FriendRequestFilter,
  FriendRequestRowDto,
  FriendsCollectionActorInterface,
  FriendsFeedFilter,
  ItemCheckInDto,
  ItemRef,
  LatestActivityFilter,
  MutualFriendsDto,
  MutualFriendsFilter,
  Page,
  PageArgs,
  ProfileFilter,
} from "@cellar-assistant/contracts";
import {
  ACTIVITY_KINDS,
  ACTIVITY_MAX_LIMIT,
  activityFeedCursor,
  ConflictError,
  compareFeedEntries,
  emptyPage,
  FriendsCollectionActorDescriptor,
  isActivityKind,
  isFriendRequestFilter,
  isItemType,
  isLatestActivityFilter,
  isMutualFriendsFilter,
  isProfileFilter,
  isTierListEntryType,
  keysetPage,
  LATEST_ACTIVITY_MAX_IDS,
  mapPage,
  NotFoundError,
  PROFILE_NOT_SHARED,
  parseActivityFeedCursor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy } from "@cellar-assistant/policy";
import { cellarOwnedBySql } from "../lib/cellar-ownership.ts";
import {
  type CheckInSqlRow,
  checkInColumns,
  toItemCheckInDto,
} from "../lib/check-in-rows.ts";
import {
  canSeeCheckInDetailsSql,
  canSeeCheckInSql,
} from "../lib/check-in-visibility.ts";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  toIso,
  uuidArray,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { placeRefVisibleToSql } from "../lib/unshared-places.ts";
import { isUuid } from "../lib/uuid.ts";
import { friendshipsOf } from "../lib/visibility.ts";
import {
  canSeeSql,
  friendIdsOf,
  type VisibilityScope,
} from "../lib/visibility-sql.ts";

type FriendRow = {
  readonly other_id: string;
  readonly since: Date | string;
  readonly sort_key: string;
};

type RequestRow = {
  readonly id: string;
  readonly user_id: string;
  readonly friend_id: string;
  readonly status: string;
};

type ReviewActivityRow = {
  readonly id: string;
  readonly user_id: string;
  readonly score: number | string;
  readonly text: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly item_type: string | null;
  readonly item_id: string | null;
};

type TierListActivityRow = {
  readonly id: string;
  readonly tier_list_id: string;
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string | null;
  readonly entry_type: string | null;
  readonly entry_id: string;
  readonly created_by_id: string;
  readonly rank: number;
};

type AddedActivityRow = {
  readonly id: string;
  readonly cellar_id: string;
  readonly created_by: string;
  readonly created_at: Date | string;
  readonly item_type: string | null;
  readonly item_id: string | null;
};

/**
 * The input every method shares, so one `requireKey`/`authorize` pair covers
 * them. `null` for `friends`, the filter for `requests`, an `ActivityFilter`
 * for `recentActivity`.
 */
type FriendsInput =
  | FriendRequestFilter
  | ActivityFilter
  | FriendsFeedFilter
  | ProfileFilter
  | LatestActivityFilter
  | MutualFriendsFilter
  | null;

type ProfileIdRow = { readonly id: string; readonly sort_key: string };
type ProfileLogRow = CheckInSqlRow & { readonly sort_key: string };

/** A row's item, or `null` when none of the six arc columns named one. */
const itemRefOf = (type: string | null, id: string | null): ItemRef | null => {
  if (type === null || id === null || !isItemType(type)) return null;
  return { type, id };
};

const requireIso = (value: Date | string | null, what: string): string => {
  const iso = toIso(value);
  if (iso === null) throw new ConflictError(`${what} has no created_at`);
  return iso;
};

/** Refuses anything but `{ kinds: ActivityKind[], limit: 1..MAX }`. */
const requireActivityFilter = (input: unknown): ActivityFilter => {
  const candidate = input as Partial<ActivityFilter> | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.kinds) ||
    !candidate.kinds.every(
      (kind) => typeof kind === "string" && isActivityKind(kind),
    )
  ) {
    throw new ValidationError(
      `unknown activity filter ${JSON.stringify(input)}`,
    );
  }
  const limit = candidate.limit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ACTIVITY_MAX_LIMIT
  ) {
    throw new ValidationError(
      `activity limit must be an integer in [1, ${ACTIVITY_MAX_LIMIT}], got ${String(limit)}`,
    );
  }
  return { kinds: candidate.kinds, limit };
};

/** F-51: at most a page of ids, each a uuid. */
const requireLatestActivityFilter = (filter: LatestActivityFilter): void => {
  if (filter.latestOf.length > LATEST_ACTIVITY_MAX_IDS) {
    throw new ValidationError(
      `latestOf takes at most ${LATEST_ACTIVITY_MAX_IDS} ids, got ${filter.latestOf.length}`,
    );
  }
  for (const id of filter.latestOf) {
    if (typeof id !== "string" || !isUuid(id)) {
      throw new ValidationError(`latestOf: not a user id: ${String(id)}`);
    }
  }
};

/** Refuses anything but `{ kinds: ActivityKind[] }`. */
const requireFeedFilter = (input: unknown): FriendsFeedFilter => {
  const candidate = input as Partial<FriendsFeedFilter> | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.kinds) ||
    !candidate.kinds.every(
      (kind) => typeof kind === "string" && isActivityKind(kind),
    )
  ) {
    throw new ValidationError(`unknown feed filter ${JSON.stringify(input)}`);
  }
  return { kinds: candidate.kinds };
};

/**
 * A row's place in the feed, compared at the precision the feed carries:
 * `occurredAt` is ISO to the millisecond (the driver drops the rest), so the
 * SQL orders and pages by the same truncation — otherwise two rows inside
 * one millisecond could straddle a page and one be skipped.
 */
const feedAt = (at: SQL): SQL => sql`date_trunc('milliseconds', ${at})`;

/** `ORDER BY` for one kind's read: the feed's order within a kind. */
const feedOrder = (at: SQL, id: SQL): SQL =>
  sql`${feedAt(at)} desc, ${id} desc`;

/**
 * Rows of `kind` strictly after `cursor` in the feed's order (`occurredAt`
 * desc, kind asc, id desc) — `isAfterFeedCursor` in `contracts`, as SQL.
 */
const afterFeedCursor = (
  kind: ActivityKind,
  cursor: ActivityFeedCursor | null,
  at: SQL,
  id: SQL,
): SQL => {
  if (cursor === null) return sql`true`;
  const bound = sql`${cursor.at}::timestamptz`;
  if (kind > cursor.kind) return sql`${feedAt(at)} <= ${bound}`;
  if (kind < cursor.kind) return sql`${feedAt(at)} < ${bound}`;
  return sql`(${feedAt(at)} < ${bound}
    or (${feedAt(at)} = ${bound} and ${id} < ${cursor.id}::uuid))`;
};

/**
 * F-51: `query` once per author, newest `limit` rows each, in one statement —
 * a lateral join over the author ids, so a page of friends costs one
 * statement per kind. Without `perAuthor`, `query` over all authors at once.
 */
const latestPerAuthor = (
  authors: SQL,
  perAuthor: boolean,
  query: (who: SQL) => SQL,
): SQL =>
  perAuthor
    ? sql`select per_author.* from unnest(${authors}) as author_ids(author_id)
          cross join lateral (${query(sql`array[author_ids.author_id]`)}) per_author`
    : query(authors);

const REVIEWS = ARCS.itemReviews;
const ENTRIES = ARCS.tierListItems;
const BOTTLES = ARCS.cellarItems;

export class FriendsCollectionActor
  extends ViewerCollectionActorBase<FriendsInput>
  implements FriendsCollectionActorInterface
{
  static readonly category: ActorCategory =
    FriendsCollectionActorDescriptor.category;

  /** **ids** — the other user of each friendship, newest first. */
  async friends(ctx: Ctx, page: PageArgs): Promise<Page<FriendEdgeDto>> {
    return mapPage(
      await this.paged<FriendRow>(
        ctx,
        null,
        page,
        (after, limit) => this.#readFriends(ctx, after, limit),
        (row) => ({ sort: row.sort_key, id: row.other_id }),
        () => this.#friendsScope(ctx),
      ),
      (row): FriendEdgeDto => ({
        userId: row.other_id,
        since: toIso(row.since) ?? "",
      }),
    );
  }

  /** **projection** — `friend_requests` rows, `otherUserId` the only id. */
  async requests(
    ctx: Ctx,
    filter: FriendRequestFilter,
    page: PageArgs,
  ): Promise<Page<FriendRequestRowDto>> {
    const viewer = ctx.viewerId;
    return mapPage(
      await this.paged<RequestRow>(
        ctx,
        filter,
        page,
        (after, limit) => this.#readRequests(ctx, filter, after, limit),
        // `friend_requests` has no `created_at`, so the id is the whole key.
        // The cursor's shape is fixed, so `sort` repeats it rather than
        // inventing a second column that does not exist.
        (row) => ({ sort: row.id, id: row.id }),
        () => this.#requestsScope(ctx, filter),
      ),
      (row): FriendRequestRowDto => {
        const outgoing = row.user_id === viewer;
        return {
          id: row.id,
          requesterId: row.user_id,
          recipientId: row.friend_id,
          status: row.status === "ACCEPTED" ? "ACCEPTED" : "PENDING",
          direction: outgoing ? "OUTGOING" : "INCOMING",
          otherUserId: outgoing ? row.friend_id : row.user_id,
        };
      },
    );
  }

  /**
   * **projection** — UI parity G31, the `/search` discovery feed
   * (`82450ad1:src/components/search/fragments.ts`'s `RecentReviewsQuery`,
   * `RecentTierListItemsQuery` and `recent_cellar_items`).
   *
   * The old page asked Hasura for `item_reviews(where: user_id _in $userIds)`
   * with `$userIds` built in the browser from the friend list — so any id
   * could be put in it, and the tier-list query's only filter was
   * `tier_list.created_by_id _in $userIds`, which returned entries (and the
   * list's **name**) from a friend's PRIVATE list. Here nothing about whose
   * activity crosses the wire: the authors are the viewer and the other side
   * of the viewer's own `friends` rows, read in this turn, and each kind keeps
   * its source's rule —
   *
   * - **REVIEWED**: the authors' reviews. `item_reviews` is world-readable to a
   *   signed-in viewer (`ItemActor.reviews`), so authorship is the only filter.
   * - **TIER_LISTED**: entries on the authors' lists that `canSeeTierList`
   *   admits — a friend's PRIVATE list contributes nothing.
   * - **ADDED**: bottles the authors added to cellars `canSeeCellar` admits
   *   (creator, co-owner, PUBLIC, FRIENDS-and-a-friend).
   * - **CHECKED_IN** (X02): drinks the authors logged, one per occasion,
   *   filtered by `canSeeCheckIn` — a bottle-less log included.
   *
   * The newest `filter.limit` of each requested kind, merged newest first —
   * the old page's three `limit: 6` queries and its client-side merge. One
   * authorised turn; one statement per kind requested, plus the friend read.
   */
  async recentActivity(
    ctx: Ctx,
    filter: ActivityFilter,
  ): Promise<readonly ActivityEntryDto[]> {
    return await this.batch(ctx, filter, [], async () => {
      const viewer = ctx.viewerId;
      // `requireKey` has already refused an anonymous caller.
      if (viewer === null) return [];
      const friendIds = friendIdsOf(
        viewer,
        await friendshipsOf(this.db, viewer),
      );
      // The same scope `visibleWhere` builds, from the friendships just read
      // rather than a second read of them.
      const scope: VisibilityScope = bypassesPolicy(ctx)
        ? { kind: "everything" }
        : { kind: "viewer", viewer, friendIds };
      const authors = uuidArray([viewer, ...friendIds], "author id");
      const kinds: readonly ActivityKind[] =
        filter.kinds.length === 0 ? ACTIVITY_KINDS : filter.kinds;

      const entries: ActivityEntryDto[] = [];
      if (kinds.includes("REVIEWED")) {
        entries.push(...(await this.#reviews(authors, filter.limit)));
      }
      if (kinds.includes("TIER_LISTED")) {
        entries.push(...(await this.#tierListed(authors, scope, filter.limit)));
      }
      if (kinds.includes("ADDED")) {
        entries.push(...(await this.#added(authors, scope, filter.limit)));
      }
      if (kinds.includes("CHECKED_IN")) {
        entries.push(
          ...(await this.#checkedIn(authors, scope, viewer, filter.limit)),
        );
      }
      return entries.sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          a.kind.localeCompare(b.kind) ||
          b.id.localeCompare(a.id),
      );
    });
  }

  /**
   * Home's Friends section (X10): `recentActivity`'s four reads, with two
   * differences — the authors are the viewer's **friends** only (Home's own
   * sections already show the viewer's), and the list pages for real.
   *
   * Each kind reads `first + 1` rows strictly after the cursor
   * (`afterFeedCursor`), the merge sorts them into the feed's order and keeps
   * `first`. Whatever a kind contributes beyond that is read again on the
   * next page, which is the price of never holding anything between turns;
   * four bounded statements per page.
   */
  async friendsFeed(
    ctx: Ctx,
    filter: FriendsFeedFilter,
    page: PageArgs,
  ): Promise<Page<ActivityEntryDto>> {
    const after =
      page.after === null ? null : parseActivityFeedCursor(page.after);
    return await this.batch(
      ctx,
      filter,
      emptyPage<ActivityEntryDto>(),
      async () => {
        const viewer = ctx.viewerId;
        if (viewer === null) return emptyPage();
        const friendIds = friendIdsOf(
          viewer,
          await friendshipsOf(this.db, viewer),
        );
        if (friendIds.length === 0) return emptyPage();
        const scope: VisibilityScope = bypassesPolicy(ctx)
          ? { kind: "everything" }
          : { kind: "viewer", viewer, friendIds };
        const authors = uuidArray(friendIds, "author id");
        const kinds: readonly ActivityKind[] =
          filter.kinds.length === 0 ? ACTIVITY_KINDS : filter.kinds;
        const limit = page.first + 1;

        const entries: ActivityEntryDto[] = [];
        if (kinds.includes("REVIEWED")) {
          entries.push(...(await this.#reviews(authors, limit, after)));
        }
        if (kinds.includes("TIER_LISTED")) {
          entries.push(
            ...(await this.#tierListed(authors, scope, limit, after)),
          );
        }
        if (kinds.includes("ADDED")) {
          entries.push(...(await this.#added(authors, scope, limit, after)));
        }
        if (kinds.includes("CHECKED_IN")) {
          entries.push(
            ...(await this.#checkedIn(authors, scope, viewer, limit, after)),
          );
        }
        return keysetPage(
          entries.sort(compareFeedEntries),
          page,
          activityFeedCursor,
        );
      },
    );
  }

  /**
   * F-51: each friend's newest entry, for the `/friends` rows ("Ranked … #1
   * · 2h ago"). `friendsFeed`'s four reads, each run once per friend through
   * a lateral join (`latestPerAuthor`, newest one row each), so a page of
   * friends is four statements plus the friend read. The authors are the
   * asked ids that are the viewer's friends, read in this turn — a stranger's
   * id answers `null` without being read — and every kind keeps its rule.
   */
  async latestActivity(
    ctx: Ctx,
    filter: LatestActivityFilter,
  ): Promise<readonly (ActivityEntryDto | null)[]> {
    const asked = filter.latestOf.map((id) => id.toLowerCase());
    const none = asked.map(() => null);
    return await this.batch(ctx, filter, none, async () => {
      const viewer = ctx.viewerId;
      if (viewer === null || asked.length === 0) return none;
      const friendIds = friendIdsOf(
        viewer,
        await friendshipsOf(this.db, viewer),
      );
      const known = new Set(friendIds);
      const wanted = [...new Set(asked.filter((id) => known.has(id)))];
      if (wanted.length === 0) return none;
      // Held to friendship, like a profile: never `"everything"`.
      const scope: VisibilityScope = { kind: "viewer", viewer, friendIds };
      const authors = uuidArray(wanted, "friend id");
      const entries = [
        ...(await this.#reviews(authors, 1, null, true)),
        ...(await this.#tierListed(authors, scope, 1, null, true)),
        ...(await this.#added(authors, scope, 1, null, true)),
        ...(await this.#checkedIn(authors, scope, viewer, 1, null, true)),
      ].sort(compareFeedEntries);
      const newest = new Map<string, ActivityEntryDto>();
      for (const entry of entries) {
        if (!newest.has(entry.userId)) newest.set(entry.userId, entry);
      }
      return asked.map((id) => newest.get(id) ?? null);
    });
  }

  /**
   * F-94: the locked profile's "Friend of …". The viewer's own friends who
   * are also the other person's friends (either direction of a `friends`
   * row, as everywhere here), counted, and the first by name. It names only
   * people already on the viewer's own list, and only for someone whose
   * profile `canSeeProfile` admits (every signed-in viewer, L41) — so a
   * non-friend may ask. Yourself, nobody and a malformed id answer the same
   * zero, so the answer is no oracle for whether an account exists (D24).
   */
  async mutualFriends(
    ctx: Ctx,
    filter: MutualFriendsFilter,
  ): Promise<MutualFriendsDto> {
    const none: MutualFriendsDto = { count: 0, firstUserId: null };
    return await this.batch(ctx, filter, none, async () => {
      const viewer = ctx.viewerId;
      const other = filter.mutualWith.toLowerCase();
      if (viewer === null || !isUuid(other) || other === viewer) return none;
      const mine = friendIdsOf(viewer, await friendshipsOf(this.db, viewer));
      if (mine.length === 0) return none;
      const { rows } = await this.db.execute<{
        readonly id: string;
        readonly total: number | string;
      }>(sql`
        select u.id, count(*) over () as total
        from "user" u
        where u.id = any(${uuidArray(mine, "friend id")})
          and u.id <> ${other}::uuid
          and exists (
            select 1 from public.friends f
            where (f.user_id = ${other}::uuid and f.friend_id = u.id)
               or (f.friend_id = ${other}::uuid and f.user_id = u.id)
          )
        order by u.name asc, u.id asc
        limit 1
      `);
      const first = rows[0];
      return first === undefined
        ? none
        : { count: Number(first.total), firstUserId: first.id };
    });
  }

  async #reviews(
    authors: SQL,
    limit: number,
    after: ActivityFeedCursor | null = null,
    perAuthor = false,
  ): Promise<ActivityEntryDto[]> {
    const query = (who: SQL): SQL => sql`
      select r.id, r.user_id, r.score, r.text::text as text,
             r.created_at, r.updated_at,
             ${REVIEWS.typeExpr("r")} as item_type,
             ${REVIEWS.idExpr("r")} as item_id
      from public.item_reviews r
      where r.user_id = any(${who})
        and ${afterFeedCursor("REVIEWED", after, sql`r.created_at`, sql`r.id`)}
      order by ${feedOrder(sql`r.created_at`, sql`r.id`)}
      limit ${limit}
    `;
    const { rows } = await this.db.execute<ReviewActivityRow>(
      latestPerAuthor(authors, perAuthor, query),
    );
    const entries: ActivityEntryDto[] = [];
    for (const row of rows) {
      const item = itemRefOf(row.item_type, row.item_id);
      if (item === null) continue;
      const createdAt = requireIso(row.created_at, `item_reviews ${row.id}`);
      entries.push({
        kind: "REVIEWED",
        id: row.id,
        occurredAt: createdAt,
        userId: row.user_id,
        item,
        placeId: null,
        review: {
          id: row.id,
          itemId: item.id,
          itemType: item.type,
          userId: row.user_id,
          score: Number(row.score),
          text: row.text,
          createdAt,
          updatedAt: requireIso(row.updated_at, `item_reviews ${row.id}`),
        },
        tierListItem: null,
        rank: null,
        cellarId: null,
        cellarItemId: null,
        checkIn: null,
      });
    }
    return entries;
  }

  async #tierListed(
    authors: SQL,
    scope: VisibilityScope,
    limit: number,
    after: ActivityFeedCursor | null = null,
    perAuthor = false,
  ): Promise<ActivityEntryDto[]> {
    const visible = canSeeSql(scope, {
      createdBy: sql`t.created_by_id`,
      privacy: sql`t.privacy`,
    });
    // `created_at` is nullable on `tier_list_items`; the old feed skipped a
    // row without one (`if (!tli.createdAt) continue`), so this does too.
    const query = (who: SQL): SQL => sql`
      select ti.id, ti.tier_list_id, ti.band, ti.position, ti.notes,
             ti.created_at, ti.updated_at,
             ti.type as entry_type,
             coalesce(ti.place_id, ${ENTRIES.idExpr("ti")}) as entry_id,
             t.created_by_id,
             (select count(*) from public.tier_list_items x
               where x.tier_list_id = ti.tier_list_id
                 and (x.band > ti.band
                      or (x.band = ti.band and x.position < ti.position))
             )::int + 1 as rank
      from public.tier_list_items ti
      join public.tier_lists t on t.id = ti.tier_list_id
      where t.created_by_id = any(${who})
        and ti.created_at is not null
        and ${visible}
        and ${placeRefVisibleToSql(
          scope.kind === "everything"
            ? "everything"
            : scope.kind === "viewer"
              ? scope.viewer
              : null,
          sql`ti.place_id`,
        )}
        and ${afterFeedCursor("TIER_LISTED", after, sql`ti.created_at`, sql`ti.id`)}
      order by ${feedOrder(sql`ti.created_at`, sql`ti.id`)}
      limit ${limit}
    `;
    const { rows } = await this.db.execute<TierListActivityRow>(
      latestPerAuthor(authors, perAuthor, query),
    );
    return rows.map((row): ActivityEntryDto => {
      if (row.entry_type === null || !isTierListEntryType(row.entry_type)) {
        throw new ConflictError(
          `tier_list_items ${row.id} names no entry; ` +
            "its type column should have made that impossible",
        );
      }
      const entry = { type: row.entry_type, id: row.entry_id };
      const createdAt = requireIso(row.created_at, `tier_list_items ${row.id}`);
      return {
        kind: "TIER_LISTED",
        id: row.id,
        occurredAt: createdAt,
        userId: row.created_by_id,
        item: itemRefOf(entry.type, entry.id),
        placeId: entry.type === "PLACE" ? entry.id : null,
        review: null,
        tierListItem: {
          id: row.id,
          tierListId: row.tier_list_id,
          band: row.band,
          position: row.position,
          notes: row.notes,
          entry,
          createdAt,
          updatedAt: toIso(row.updated_at),
        },
        rank: row.rank,
        cellarId: null,
        cellarItemId: null,
        checkIn: null,
      };
    });
  }

  async #added(
    authors: SQL,
    scope: VisibilityScope,
    limit: number,
    after: ActivityFeedCursor | null = null,
    perAuthor = false,
  ): Promise<ActivityEntryDto[]> {
    const visible = canSeeSql(scope, {
      createdBy: sql`c.created_by_id`,
      privacy: sql`c.privacy`,
      coOwnedCellarId: sql`c.id`,
    });
    const query = (who: SQL): SQL => sql`
      select ci.id, ci.cellar_id, ci.created_by, ci.created_at,
             ${BOTTLES.typeExpr("ci")} as item_type,
             ${BOTTLES.idExpr("ci")} as item_id
      from public.cellar_items ci
      join public.cellars c on c.id = ci.cellar_id
      where ci.created_by = any(${who})
        and ${visible}
        and ${afterFeedCursor("ADDED", after, sql`ci.created_at`, sql`ci.id`)}
      order by ${feedOrder(sql`ci.created_at`, sql`ci.id`)}
      limit ${limit}
    `;
    const { rows } = await this.db.execute<AddedActivityRow>(
      latestPerAuthor(authors, perAuthor, query),
    );
    const entries: ActivityEntryDto[] = [];
    for (const row of rows) {
      const item = itemRefOf(row.item_type, row.item_id);
      if (item === null) continue;
      entries.push({
        kind: "ADDED",
        id: row.id,
        occurredAt: requireIso(row.created_at, `cellar_items ${row.id}`),
        userId: row.created_by,
        item,
        placeId: null,
        review: null,
        tierListItem: null,
        rank: null,
        cellarId: row.cellar_id,
        cellarItemId: row.id,
        checkIn: null,
      });
    }
    return entries;
  }

  /**
   * **CHECKED_IN** (X02): drinks the authors logged, one entry per occasion.
   *
   * A table's round is one row per drinker (`CheckInActor.log`), and listing
   * each would put "You had X", "Sam had X" and "Ana had X" in a row on the
   * feed. So each `group_id` contributes its keyed row (the logger's own),
   * or — when that row is not an author's — the earliest author row, and the
   * entry's `companionIds` name the rest. `canSeeCheckIn` runs as SQL even
   * though every author is the viewer or a friend (the friend branch admits
   * them all): the rule stays stated where the rows are read.
   */
  async #checkedIn(
    authors: SQL,
    scope: VisibilityScope,
    viewer: string,
    limit: number,
    after: ActivityFeedCursor | null = null,
    perAuthor = false,
  ): Promise<ActivityEntryDto[]> {
    const visible = canSeeCheckInSql(scope, "ci");
    const query = (who: SQL): SQL => sql`
      select * from (
        select distinct on (ci.group_id)
          ${checkInColumns("ci", canSeeCheckInDetailsSql(scope, "ci"), scope)}
        from public.check_ins ci
        where ci.user_id = any(${who})
          and ${visible}
        order by ci.group_id, (ci.id = ci.group_id) desc, ci.created_at, ci.id
      ) occasion
      where ${afterFeedCursor(
        "CHECKED_IN",
        after,
        sql`occasion.created_at`,
        sql`occasion.id`,
      )}
      order by ${feedOrder(sql`occasion.created_at`, sql`occasion.id`)}
      limit ${limit}
    `;
    const { rows } = await this.db.execute<CheckInSqlRow>(
      latestPerAuthor(authors, perAuthor, query),
    );
    return rows.map((row): ActivityEntryDto => {
      const checkIn = toItemCheckInDto(row, viewer);
      return {
        kind: "CHECKED_IN",
        id: checkIn.id,
        occurredAt: checkIn.createdAt,
        userId: checkIn.userId,
        item: checkIn.item,
        // `ActivityEntry.place` means "the tier-listed place"; a log's place
        // is `checkIn.placeId`, read from the entry itself.
        placeId: null,
        review: null,
        tierListItem: null,
        rank: null,
        cellarId: null,
        cellarItemId: null,
        checkIn,
      };
    });
  }

  /* -------------------------------------------------------------------- */
  /* A friend's profile — X18                                              */
  /* -------------------------------------------------------------------- */

  /**
   * Who, and friends since when — or `NotFound`. The gate for the whole
   * profile: the `profile*` reads below re-check it on their own turns
   * (`authorize`), so a page of them can never be had for a non-friend by
   * skipping this call.
   *
   * Every refusal is the same `NotFound` with the same message
   * ({@link PROFILE_NOT_SHARED}) — a stranger, yourself, an id that names
   * nobody, a string that is not an id. A profile never answers "this
   * account exists" (D24).
   */
  async profile(ctx: Ctx, userId: string): Promise<FriendProfileDto> {
    const filter: ProfileFilter = {
      profileOf: String(userId).toLowerCase(),
    };
    const found = await this.batch<FriendProfileDto | null>(
      ctx,
      filter,
      null,
      async () => {
        const viewer = ctx.viewerId;
        if (viewer === null) return null;
        const { rows } = await this.db.execute<{
          readonly since: Date | string | null;
        }>(sql`
          select max(created_at) as since from public.friends
          where (user_id = ${viewer}::uuid and friend_id = ${filter.profileOf}::uuid)
             or (user_id = ${filter.profileOf}::uuid and friend_id = ${viewer}::uuid)
        `);
        const since = toIso(rows[0]?.since ?? null);
        return since === null ? null : { userId: filter.profileOf, since };
      },
    );
    if (found === null) throw new NotFoundError(PROFILE_NOT_SHARED);
    return found;
  }

  /**
   * **ids** — the friend's own tier lists `canSeeTierList` admits for a
   * friend (`#asFriend`): their PUBLIC and FRIENDS lists, never a PRIVATE
   * one, whoever is asking. Ordered like
   * `/tier-lists`, by when the contents last moved.
   */
  async profileTierLists(
    ctx: Ctx,
    filter: ProfileFilter,
    page: PageArgs,
  ): Promise<Page<string>> {
    const sort = sql`t.content_updated_at`;
    const id = sql`t.id`;
    const asFriend = this.#asFriend(ctx);
    const scope = async (): Promise<PageScope> => ({
      from: sql`public.tier_lists t`,
      where: sql`t.created_by_id = ${filter.profileOf}::uuid and ${canSeeSql(
        await asFriend(),
        { createdBy: sql`t.created_by_id`, privacy: sql`t.privacy` },
      )}`,
    });
    return mapPage(
      await this.paged<ProfileIdRow>(
        ctx,
        filter,
        page,
        async (after, limit) => {
          const { from, where } = await scope();
          const { rows } = await this.db.execute<ProfileIdRow>(sql`
            select t.id, (t.content_updated_at)::text as sort_key
            from ${from}
            where ${where}
              and ${keysetWhere(after, sort, id, "timestamptz", "desc")}
            order by ${keysetOrder(sort, id, "desc")}
            limit ${limit}
          `);
          return rows;
        },
        (row) => ({ sort: row.sort_key, id: row.id }),
        scope,
      ),
      (row) => row.id,
    );
  }

  /**
   * **ids** — cellars the friend created or co-owns (`cellarOwnedBySql`)
   * that `canSeeCellar` admits, newest first. A cellar the friend co-owns
   * with a stranger is listed only if the viewer could open it anyway.
   */
  async profileCellars(
    ctx: Ctx,
    filter: ProfileFilter,
    page: PageArgs,
  ): Promise<Page<string>> {
    const sort = sql`c.created_at`;
    const id = sql`c.id`;
    const asFriend = this.#asFriend(ctx);
    const scope = async (): Promise<PageScope> => ({
      from: sql`public.cellars c`,
      where: sql`${cellarOwnedBySql(filter.profileOf, "c")} and ${canSeeSql(
        await asFriend(),
        {
          createdBy: sql`c.created_by_id`,
          privacy: sql`c.privacy`,
          coOwnedCellarId: sql`c.id`,
        },
      )}`,
    });
    return mapPage(
      await this.paged<ProfileIdRow>(
        ctx,
        filter,
        page,
        async (after, limit) => {
          const { from, where } = await scope();
          const { rows } = await this.db.execute<ProfileIdRow>(sql`
            select c.id, (c.created_at)::text as sort_key
            from ${from}
            where ${where}
              and ${keysetWhere(after, sort, id, "timestamptz", "desc")}
            order by ${keysetOrder(sort, id, "desc")}
            limit ${limit}
          `);
          return rows;
        },
        (row) => ({ sort: row.sort_key, id: row.id }),
        scope,
      ),
      (row) => row.id,
    );
  }

  /**
   * **projection** — the friend's drink log: entries *about* them, newest
   * first, through `canSeeCheckIn` and `canSeeCheckInDetails` as SQL. Every
   * entry about a friend passes both (the friend branch), but the rules stay
   * stated where the rows are read, as the feed's `#checkedIn` does — and a
   * place under review that is not the viewer's comes back unnamed
   * (`checkInColumns`).
   */
  async profileLogs(
    ctx: Ctx,
    filter: ProfileFilter,
    page: PageArgs,
  ): Promise<Page<ItemCheckInDto>> {
    const sort = sql`ci.created_at`;
    const id = sql`ci.id`;
    const asFriend = this.#asFriend(ctx);
    const scope = async (): Promise<PageScope> => ({
      from: sql`public.check_ins ci`,
      where: sql`ci.user_id = ${filter.profileOf}::uuid and ${canSeeCheckInSql(
        await asFriend(),
        "ci",
      )}`,
    });
    return mapPage(
      await this.paged<ProfileLogRow>(
        ctx,
        filter,
        page,
        async (after, limit) => {
          const visible = await asFriend();
          const { from, where } = await scope();
          const { rows } = await this.db.execute<ProfileLogRow>(sql`
            select ${checkInColumns(
              "ci",
              canSeeCheckInDetailsSql(visible, "ci"),
              visible,
            )},
                   (ci.created_at)::text as sort_key
            from ${from}
            where ${where}
              and ${keysetWhere(after, sort, id, "timestamptz", "desc")}
            order by ${keysetOrder(sort, id, "desc")}
            limit ${limit}
          `);
          return rows;
        },
        (row) => ({ sort: row.sort_key, id: row.id }),
        scope,
      ),
      (row) => toItemCheckInDto(row, ctx.viewerId),
    );
  }

  protected override async authorize(
    ctx: Ctx,
    input: FriendsInput,
  ): Promise<"allow" | "empty"> {
    await super.authorize(ctx, input);
    if (input === null) return "allow";
    if (isProfileFilter(input)) return await this.#authorizeProfile(ctx, input);
    if (isLatestActivityFilter(input)) {
      requireLatestActivityFilter(input);
      return "allow";
    }
    if (isMutualFriendsFilter(input)) return "allow";
    if (typeof input === "string") {
      if (!isFriendRequestFilter(input)) {
        throw new ValidationError(
          `unknown friend request filter ${JSON.stringify(input)}`,
        );
      }
      return "allow";
    }
    if ("limit" in input) requireActivityFilter(input);
    else requireFeedFilter(input);
    return "allow";
  }

  /**
   * What a profile section is filtered by: the viewer **as a friend** —
   * never `visibilityScope`'s `"everything"`, even for an admin. A profile is
   * what someone shares with their friends, and the gate already holds an
   * admin to friendship (`#authorizeProfile`); listing an admin's friend's
   * PRIVATE list here would show them, on a social page, something that
   * friend never shared. Opening a row by its id is still the policy
   * package's call, unchanged.
   *
   * Lazy and read once per turn: the page and its `count(*)` share it, and a
   * turn `authorize` answered `"empty"` never reads it at all.
   */
  #asFriend(ctx: Ctx): () => Promise<VisibilityScope> {
    let scope: Promise<VisibilityScope> | null = null;
    return () => {
      scope ??= (async (): Promise<VisibilityScope> => {
        const viewer = ctx.viewerId;
        if (viewer === null) return { kind: "nothing" };
        return {
          kind: "viewer",
          viewer,
          friendIds: friendIdsOf(viewer, await friendshipsOf(this.db, viewer)),
        };
      })();
      return scope;
    };
  }

  /**
   * The profile reads' gate, on every turn: the profile must be a friend of
   * the viewer. Anything else — a stranger, the viewer themself, a malformed
   * id, nobody — is `"empty"`, the same answer for all of them; `profile`
   * turns that into its one `NotFound`.
   *
   * Friendship is a fact about two users, not a permission, so an admin
   * viewer is held to it too (`isFriend`'s rule): a profile is a friend's.
   */
  async #authorizeProfile(
    ctx: Ctx,
    filter: ProfileFilter,
  ): Promise<"allow" | "empty"> {
    const viewer = ctx.viewerId;
    if (viewer === null || !isUuid(filter.profileOf)) return "empty";
    const friendIds = friendIdsOf(viewer, await friendshipsOf(this.db, viewer));
    return friendIds.includes(filter.profileOf.toLowerCase())
      ? "allow"
      : "empty";
  }

  /**
   * Shared by the page and its `count(*)` — see `PageScope`.
   *
   * The grouped union used to be a `WITH` clause, and is now a **derived
   * table** so that the same fragment can be the `FROM` of both queries: a CTE
   * has to precede the `SELECT` it feeds, which `select count(*) from ${from}`
   * cannot express. The SQL is otherwise identical, and grouping still makes
   * `(since, other_id)` unique per friendship — see the module doc on why both
   * directions are read in the first place.
   *
   * One friendship counts once here, which is the number the page shows.
   */
  #friendsScope(ctx: Ctx): PageScope {
    const viewer = ctx.viewerId;
    if (viewer === null) {
      return { from: sql`public.friends f`, where: sql`false` };
    }
    return {
      from: sql`(
        select other_id, max(created_at) as since
        from (
          select friend_id as other_id, created_at from public.friends
            where user_id = ${viewer}::uuid
          union all
          select user_id as other_id, created_at from public.friends
            where friend_id = ${viewer}::uuid
        ) edges
        where other_id <> ${viewer}::uuid group by other_id
      ) f`,
      where: sql`true`,
    };
  }

  async #readFriends(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly FriendRow[]> {
    const sort = sql`f.since`;
    const id = sql`f.other_id`;
    const { from, where } = this.#friendsScope(ctx);
    const { rows } = await this.db.execute<FriendRow>(sql`
      select f.other_id, f.since, (f.since)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, sort, id, "timestamptz", "desc")}
      order by ${keysetOrder(sort, id, "desc")}
      limit ${limit}
    `);
    return rows;
  }

  /** Shared by the page and its `count(*)` — see `PageScope`. */
  #requestsScope(ctx: Ctx, filter: FriendRequestFilter): PageScope {
    const viewer = ctx.viewerId;
    // Direction is relative to the viewer, never stored:
    // `friend_requests.user_id` is always the requester (§2.1, B4).
    const direction =
      viewer === null
        ? sql`false`
        : filter === "OUTGOING"
          ? sql`r.user_id = ${viewer}::uuid`
          : filter === "INCOMING"
            ? sql`r.friend_id = ${viewer}::uuid`
            : sql`(r.user_id = ${viewer}::uuid or r.friend_id = ${viewer}::uuid)`;
    return { from: sql`public.friend_requests r`, where: direction };
  }

  async #readRequests(
    ctx: Ctx,
    filter: FriendRequestFilter,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly RequestRow[]> {
    const sort = sql`r.id`;
    const id = sql`r.id`;
    const { from, where } = this.#requestsScope(ctx, filter);
    const { rows } = await this.db.execute<RequestRow>(sql`
      select r.id, r.user_id, r.friend_id, r.status::text as status
      from ${from}
      where ${where}
        and ${keysetWhere(after, sort, id, "uuid", "desc")}
      order by ${keysetOrder(sort, id, "desc")}
      limit ${limit}
    `);
    return rows;
  }
}
