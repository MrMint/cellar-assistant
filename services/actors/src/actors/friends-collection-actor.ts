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
  ActorCategory,
  Ctx,
  FriendEdgeDto,
  FriendRequestFilter,
  FriendRequestRowDto,
  FriendsCollectionActorInterface,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  FriendsCollectionActorDescriptor,
  isFriendRequestFilter,
  mapPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import { keysetOrder, keysetWhere, toIso } from "../lib/collection-sql.ts";

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

/**
 * The input both methods share, so one `requireKey`/`authorize` pair covers
 * them. `null` for `friends`, the filter for `requests`.
 */
type FriendsInput = FriendRequestFilter | null;

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

  protected override async authorize(
    ctx: Ctx,
    input: FriendsInput,
  ): Promise<"allow" | "empty"> {
    await super.authorize(ctx, input);
    if (input !== null && !isFriendRequestFilter(input)) {
      throw new ValidationError(
        `unknown friend request filter ${JSON.stringify(input)}`,
      );
    }
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
