/**
 * `UserSearchActor(hash)` — C1 (migration plan §2.3), §1.5's **third**
 * identity-sensitive surface.
 *
 * > | `UserSearchActor(hash)` | friend search with existing-friend exclusion |
 * > **yes** | projection |
 *
 * Replaces `SearchUsersQuery` in `src/components/friend/actions.ts`: display
 * name `_ilike`, minus the viewer, minus anyone already a friend, minus anyone
 * with a request open in either direction. Two viewers typing the same word get
 * genuinely different answers, which is why the viewer is in the key.
 *
 * ## The exclusion set is not a join, deliberately
 *
 * Today's query expresses the exclusions as four nested `_not`s inside one
 * Hasura `where`, because `users`, `friends` and `friend_requests` were all in
 * one database. A6 broke that by moving identity to better-auth's `user` table
 * in a second database; X2 put them back in one, so the join is expressible
 * again — and this actor still does not write it. `ProfileStore` is the whole
 * of `services/actors`' contact with better-auth's tables outside `auth/`
 * (`src/lib/profile-store.ts`), and a search reaching back into two aggregates
 * it does not own would be a worse trade than one extra query. So this actor
 * computes the exclusion set from `friends` and `friend_requests` and passes it
 * to `ProfileStore.search`, which applies it **before** its `LIMIT`.
 *
 * Before, not after. Filtering the page afterwards is the obvious shortcut and
 * it is wrong: a viewer with ten friends whose names all begin "Al" would get
 * an empty page for "al" while a matching stranger sat at position eleven.
 *
 * ## Neither half of the exclusion is symmetric, and both directions matter
 *
 * `friends` is written one row per side and read in either direction (B4's
 * outcome note: between the two calls of an acceptance only one row exists).
 * `friend_requests.user_id` is the *requester* and `friend_id` the recipient,
 * so an open request in **either** direction must exclude — otherwise the
 * person who just sent you a request reappears in your search results as
 * someone to request.
 */
import type {
  ActorCategory,
  Ctx,
  Page,
  PageArgs,
  UserSearchActorInterface,
  UserSearchHit,
  UserSearchInput,
} from "@cellar-assistant/contracts";
import {
  USER_SEARCH_RESULT_CAP,
  UserSearchActorDescriptor,
  userSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { friendRequests, friends } from "@cellar-assistant/db";
import { eq, or } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requireSignedIn } from "../lib/guards.ts";
import type { ProfileStore } from "../lib/profile-store.ts";
import { betterAuthProfileStore } from "../lib/profile-store.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";

export class UserSearchActor
  extends SearchActorBase<UserSearchInput, UserSearchHit>
  implements UserSearchActorInterface
{
  static readonly category: ActorCategory = UserSearchActorDescriptor.category;

  readonly #profiles: ProfileStore;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    profiles: ProfileStore = betterAuthProfileStore(),
  ) {
    super(daprClient, id, db);
    this.#profiles = profiles;
  }

  protected keyFor(input: UserSearchInput, viewerId: string | null): string {
    return userSearchActorId(input, viewerId);
  }

  async results(
    ctx: Ctx,
    input: UserSearchInput,
    page: PageArgs,
  ): Promise<Page<UserSearchHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: UserSearchInput,
  ): Promise<readonly UserSearchHit[]> {
    return this.resultSet(ctx, input);
  }

  /** Every turn: the exclusion set is the viewer's, so the viewer must exist. */
  protected override async authorize(
    ctx: Ctx,
    input: UserSearchInput,
  ): Promise<"allow"> {
    requireSignedIn(ctx, "search for people");
    if (input.term.trim() === "") {
      throw new ValidationError("a user search needs something to search for");
    }
    requireLimit(input.limit ?? USER_SEARCH_RESULT_CAP);
    return "allow";
  }

  protected async runSearch(
    ctx: Ctx,
    input: UserSearchInput,
  ): Promise<readonly UserSearchHit[]> {
    const viewer = ctx.viewerId;
    const term = input.term.trim();
    const limit = requireLimit(input.limit ?? USER_SEARCH_RESULT_CAP);

    // An admin ctx has no viewer of its own to exclude around; it searches the
    // whole directory. `bypassesPolicy` covers system and admin (§1.6).
    const excludeIds = viewer === null ? [] : await this.#excludedFor(viewer);

    const rows = await this.#profiles.search({ term, excludeIds, limit });
    return rows.map((row) => ({
      userId: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    }));
  }

  /** The viewer, everyone they are friends with, everyone mid-request. */
  async #excludedFor(viewer: string): Promise<readonly string[]> {
    const friendRows = await this.db
      .select({ userId: friends.userId, friendId: friends.friendId })
      .from(friends)
      .where(or(eq(friends.userId, viewer), eq(friends.friendId, viewer)));

    const requestRows = await this.db
      .select({
        userId: friendRequests.userId,
        friendId: friendRequests.friendId,
      })
      .from(friendRequests)
      .where(
        or(
          eq(friendRequests.userId, viewer),
          eq(friendRequests.friendId, viewer),
        ),
      );

    const excluded = new Set<string>([viewer]);
    for (const row of [...friendRows, ...requestRows]) {
      excluded.add(row.userId);
      excluded.add(row.friendId);
    }
    return [...excluded];
  }
}

const requireLimit = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > USER_SEARCH_RESULT_CAP) {
    throw new ValidationError(
      `limit must be an integer in [1, ${USER_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
