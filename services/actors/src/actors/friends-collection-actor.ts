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
  ActivityFilter,
  ActivityKind,
  ActorCategory,
  Ctx,
  FriendEdgeDto,
  FriendRequestFilter,
  FriendRequestRowDto,
  FriendsCollectionActorInterface,
  ItemRef,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  ACTIVITY_KINDS,
  ACTIVITY_MAX_LIMIT,
  ConflictError,
  FriendsCollectionActorDescriptor,
  isActivityKind,
  isFriendRequestFilter,
  isItemType,
  isTierListEntryType,
  mapPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy } from "@cellar-assistant/policy";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  toIso,
  uuidArray,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
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
type FriendsInput = FriendRequestFilter | ActivityFilter | null;

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
      return entries.sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          a.kind.localeCompare(b.kind) ||
          b.id.localeCompare(a.id),
      );
    });
  }

  async #reviews(authors: SQL, limit: number): Promise<ActivityEntryDto[]> {
    const { rows } = await this.db.execute<ReviewActivityRow>(sql`
      select r.id, r.user_id, r.score, r.text::text as text,
             r.created_at, r.updated_at,
             ${REVIEWS.typeExpr("r")} as item_type,
             ${REVIEWS.idExpr("r")} as item_id
      from public.item_reviews r
      where r.user_id = any(${authors})
      order by r.created_at desc, r.id desc
      limit ${limit}
    `);
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
      });
    }
    return entries;
  }

  async #tierListed(
    authors: SQL,
    scope: VisibilityScope,
    limit: number,
  ): Promise<ActivityEntryDto[]> {
    const visible = canSeeSql(scope, {
      createdBy: sql`t.created_by_id`,
      privacy: sql`t.privacy`,
    });
    // `created_at` is nullable on `tier_list_items`; the old feed skipped a
    // row without one (`if (!tli.createdAt) continue`), so this does too.
    const { rows } = await this.db.execute<TierListActivityRow>(sql`
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
      where t.created_by_id = any(${authors})
        and ti.created_at is not null
        and ${visible}
      order by ti.created_at desc, ti.id desc
      limit ${limit}
    `);
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
      };
    });
  }

  async #added(
    authors: SQL,
    scope: VisibilityScope,
    limit: number,
  ): Promise<ActivityEntryDto[]> {
    const visible = canSeeSql(scope, {
      createdBy: sql`c.created_by_id`,
      privacy: sql`c.privacy`,
      coOwnedCellarId: sql`c.id`,
    });
    const { rows } = await this.db.execute<AddedActivityRow>(sql`
      select ci.id, ci.cellar_id, ci.created_by, ci.created_at,
             ${BOTTLES.typeExpr("ci")} as item_type,
             ${BOTTLES.idExpr("ci")} as item_id
      from public.cellar_items ci
      join public.cellars c on c.id = ci.cellar_id
      where ci.created_by = any(${authors})
        and ${visible}
      order by ci.created_at desc, ci.id desc
      limit ${limit}
    `);
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
      });
    }
    return entries;
  }

  protected override async authorize(
    ctx: Ctx,
    input: FriendsInput,
  ): Promise<"allow" | "empty"> {
    await super.authorize(ctx, input);
    if (input === null) return "allow";
    if (typeof input === "string") {
      if (!isFriendRequestFilter(input)) {
        throw new ValidationError(
          `unknown friend request filter ${JSON.stringify(input)}`,
        );
      }
      return "allow";
    }
    requireActivityFilter(input);
    return "allow";
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
