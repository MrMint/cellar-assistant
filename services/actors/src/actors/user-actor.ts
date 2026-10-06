/**
 * `UserActor` — B4 (migration plan §2.1, §1.7, §3).
 *
 * Owns four tables, all of them scoped to *this* user:
 *
 *   - `friends` — rows where `user_id = me`
 *   - `friend_requests` — rows where `user_id = me` (i.e. the ones **I** sent)
 *   - `item_favorites` — rows where `user_id = me`
 *   - `user_place_interactions` — rows where `user_id = me`
 *
 * Profile fields are not on that list: there is no `public.users` table, and
 * A6 moved identity to better-auth's `user` table in its own database
 * (`src/auth/README.md`). `getProfile`/`updateProfile` reach it through
 * `../lib/profile-store.ts`, which is the same constructor-seam trick
 * `FileActor` uses for the object store.
 *
 * ## The friend graph is two-sided, and that is the whole design
 *
 * `friends` is directed — one row per direction — and §1.2 is absolute: **no
 * actor writes another aggregate's rows, even inside a transaction.** A user is
 * an aggregate, so `UserActor(alice)` may not insert `friends(bob, alice)` even
 * though it knows exactly what that row should say. §1.7 spells out the
 * consequence:
 *
 * ```
 *   UserActor(recipient).acceptFriendRequest(user ctx, requestId)
 *     ├─ insert friends(recipient, requester)          ┐ one transaction
 *     └─ insert outbox → UserActor(requester)          ┘ (§1.4)
 *                          .confirmFriendship(system, { friendId: recipient })
 *
 *   … OutboxActor drains …
 *
 *   UserActor(requester).confirmFriendship(system ctx, payload)
 *     ├─ insert friends(requester, recipient)          ┐ one transaction
 *     └─ delete friend_requests(requester, recipient)  ┘
 * ```
 *
 * `rejectFriendRequest`/`withdrawFriendRequest` is the same shape for the same
 * reason.
 *
 * **`removeFriend` is the one documented exception, added by E2d.** A removal
 * cannot be eventually consistent the way an acceptance can: `isFriend` matches
 * either direction, so a half-delivered *acceptance* reads as "friends" (which
 * is the answer both parties want) while a half-delivered *removal* also reads
 * as "friends" (which is the answer nobody wants, and which target-stack
 * records as a fail-open security hazard). So `removeFriend` deletes **both**
 * rows in its own transaction and the outbox row becomes the other side's cache
 * invalidation. See that method's own comment for the measurement and the
 * trade-off; `TABLE_WRITERS` is unchanged, because the writer *class* is.
 *
 * **Every method the outbox can reach is idempotent on a unique key** (§8.4),
 * because delivery is at least once:
 *
 * | method | idempotent because |
 * |---|---|
 * | `confirmFriendship` | `insert … on conflict (friends_pkey) do nothing`, and the `delete` matches zero rows the second time |
 * | `removeFriendOtherSide` | deleting an absent row is a no-op — which after E2d is the *normal* case, the row having gone in `removeFriend`'s own transaction |
 * | `withdrawFriendRequest` | deleting an absent row is a no-op |
 *
 * Each returns whether it *actually* changed anything, so a test can prove the
 * second delivery did nothing rather than merely assert the row count.
 *
 * ## Reading both directions
 *
 * Every friend decision here reads `friends` rows where `user_id = me` **or**
 * `friend_id = me`. Writing is one-sided; reading is not, and the difference
 * matters: between step 1 and step 2 above only one row exists, and a viewer
 * whose `isFriend` looked at one direction would flicker between "friends" and
 * "not friends" for as long as the outbox took. `packages/policy`'s `isFriend`
 * already matches either direction and needed no change for this. **Do not
 * "simplify" that to one direction** — `user-actor.test.ts` pins it.
 *
 * ## Only the rows this actor *writes* are cached
 *
 * §1.3 lets an actor cache its aggregate on activate, and §1.2 gives every
 * table exactly one writer. Together those mean an actor may cache only the
 * rows **it itself** writes — which for a `UserActor` is narrower than "the
 * tables `UserActor` writes", because the other side of every friendship is
 * written by a *different key of this same class*:
 *
 * | rows | written by | cached? |
 * |---|---|---|
 * | `friends(me, *)` | this actor | yes — `aggregate.ownFriends` |
 * | `friends(*, me)` | `UserActor(other)` | **no** — read fresh |
 * | `friend_requests(me, *)` | this actor | yes — `aggregate.outgoing` |
 * | `friend_requests(*, me)` | `UserActor(other)` | **no** — read fresh |
 * | `item_favorites`, `user_place_interactions` | this actor | yes |
 *
 * `TABLE_WRITERS` cannot express that distinction — it is keyed by table, and
 * `UserActor` really is the sole writer *class* of both tables — which is why
 * the B10 audit flagged the shape and left it. It then bit: `removeFriend`
 * deletes `friends(me, other)` and reloads **immediately**, long before the
 * outbox delivers `removeFriendOtherSide`, so a cached `friends(other, me)`
 * came straight back into the aggregate and the actor believed the friendship
 * survived *indefinitely* — `sendFriendRequest` answered "you are already
 * friends" against a database holding zero rows, while `FriendsCollectionActor`
 * (which queries fresh) correctly showed none. Two read paths, disagreeing
 * forever.
 *
 * So the reverse-direction rows are read **fresh, per call**, by `#snapshot()`
 * — B6's `RecipeGroupActor` and B10's `BarcodeActor` are the same fix. Two
 * indexed selects on a path nobody calls in a loop is the right price for not
 * being wrong.
 *
 * E2d turns that distinction around one last time: `removeFriend` now deletes
 * the reverse row too, so the only copy of it that can be stale afterwards is
 * the **other key's `ownFriends` cache**, which no read here consults. That is
 * what `removeFriendOtherSide`'s `reload()` is now for.
 *
 * ## No external calls
 *
 * §2.1: "**No AI or external call runs inside a `UserActor` turn** — a
 * multi-second call would block every other operation for that user." Nothing
 * here calls `fetch`, the sidecar, or an AI provider; the only awaits are
 * Postgres and the profile store's Postgres. `user-actor.test.ts` asserts that
 * statically against this file's own source.
 */
import type {
  AcceptFriendRequestResult,
  ActorCategory,
  ConfirmFriendshipPayload,
  ConfirmFriendshipResult,
  Ctx,
  FriendDto,
  FriendRequestDirection,
  FriendRequestDto,
  ItemRef,
  OtherSidePayload,
  Page,
  PageArgs,
  PlaceInteractionDto,
  RecordPlaceInteractionInput,
  ToggleFavoriteResult,
  UpdateProfileInput,
  UserActorInterface,
  UserProfileDto,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  isItemType,
  itemActorId,
  NotFoundError,
  offsetPage,
  requireReverseEdgeBatch,
  UserActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  friendRequests,
  friends,
  itemFavorites,
  places,
  userPlaceInteractions,
  user as userTable,
} from "@cellar-assistant/db";
import { and, eq, inArray, or, sql } from "@cellar-assistant/db/orm";
import { type Friendship, isFriend, isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { isEmailShaped } from "../auth/display-name.ts";
import { EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { deliveryOf } from "../lib/delivery.ts";
import { requirePrivileged, requireSignedIn } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import type { ProfileFields, ProfileStore } from "../lib/profile-store.ts";
import { betterAuthProfileStore } from "../lib/profile-store.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";

export type FriendRow = typeof friends.$inferSelect;
export type FriendRequestRow = typeof friendRequests.$inferSelect;
export type FavoriteRow = typeof itemFavorites.$inferSelect;
export type PlaceInteractionRow = typeof userPlaceInteractions.$inferSelect;

/**
 * **Only the rows this actor writes** — see the module doc's "Only the rows
 * this actor *writes* are cached". The other side of a friendship or a request
 * belongs to another `UserActor` key and is read fresh by `#snapshot()`.
 */
export type UserAggregate = {
  /** `friends` where `user_id = me` — the direction this actor writes. */
  readonly ownFriends: readonly FriendRow[];
  /** `friend_requests` where `user_id = me` — the ones this actor may write. */
  readonly outgoing: readonly FriendRequestRow[];
  readonly favorites: readonly FavoriteRow[];
  readonly interactions: readonly PlaceInteractionRow[];
};

/** The owned rows plus a *fresh* read of the ones another key writes. */
type UserSnapshot = {
  /** Every `friends` row touching this user, in **both** directions. */
  readonly friendRows: readonly FriendRow[];
  /** The same rows as `packages/policy`'s `isFriend` wants them. */
  readonly friendships: readonly Friendship[];
  /** `friend_requests` where `user_id = me`, from the aggregate. */
  readonly outgoing: readonly FriendRequestRow[];
  /** `friend_requests` where `friend_id = me` — another key's rows, fresh. */
  readonly incoming: readonly FriendRequestRow[];
};

/** The Dapr actor type name — the class name `src/actors/registry.ts` registers. */
export const USER_ACTOR_TYPE = "UserActor";

/**
 * The refusal for the three outbox-delivered methods. `system` is constructed
 * only by `OutboxActor` and job actors and is not derivable from a request
 * (§1.6), so the only other caller `requirePrivileged` admits is an
 * administrator — the manual repair path for a dead-lettered handshake (see
 * the B4 report).
 */
const deliveredOnly = (method: string): string =>
  `UserActor.${method} is delivered by the outbox (§1.7); a request may ` +
  "never call it directly";

const MAX_DISPLAY_NAME = 200;
const MAX_NOTES = 4_000;
const MAX_TAGS = 25;

/** `item_favorites`' item arc (`../lib/item-arcs.ts`). */
const FAVORITES = ARCS.itemFavorites;

const favoriteValues = (userId: string, ref: ItemRef) => ({
  userId,
  ...FAVORITES.values(ref),
});

/**
 * `item_favorites.type` is a `STORED GENERATED` column over the six id columns
 * (A3's correction to §4), so it is always consistent with whichever one is
 * non-null — a row whose set column disagrees with it reads as no favourite.
 */
const favoriteRef = (row: FavoriteRow): ItemRef | null => {
  const ref = FAVORITES.refOf(row);
  return ref !== null && ref.type === row.type ? ref : null;
};

const iso = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
};

const requiredIso = (value: Date | string | null): string =>
  iso(value) ?? new Date(0).toISOString();

export class UserActor
  extends EntityActorBase<UserAggregate>
  implements UserActorInterface
{
  static readonly category: ActorCategory = UserActorDescriptor.category;

  readonly #profiles: ProfileStore;

  /**
   * The fourth, defaulted parameter is the profile seam — the same shape as
   * `FileActor`'s binding. Production gets better-auth's own database; the
   * test harness passes a fake, because it runs inside one rolled-back
   * transaction on the *main* database and has no second connection to give.
   */
  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    profiles: ProfileStore = betterAuthProfileStore(),
  ) {
    super(daprClient, id, db);
    this.#profiles = profiles;
  }

  /* ---------------------------------------------------------------------- */
  /* Activation                                                              */
  /* ---------------------------------------------------------------------- */

  protected async loadAggregate(id: string): Promise<UserAggregate | null> {
    // Dapr will happily activate `UserActor("nonsense")`; a non-uuid key would
    // otherwise reach Postgres as a failed cast rather than a `NotFound`.
    if (!isUuid(id)) return null;

    // Existence comes from the table the four owned tables' foreign keys point
    // at. X2 made that better-auth's `user`: one identity table, in this
    // database, so "exists" and "has a profile" are now the same row rather
    // than two rows in two databases that could disagree.
    const [exists] = await this.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, id));
    if (exists === undefined) return null;

    // Only `user_id = me`, in both cases: the mirrored rows are another
    // `UserActor` key's to write, so caching them here goes stale with nothing
    // to invalidate it (module doc). `#snapshot()` reads those fresh.
    const [ownFriends, outgoing, favoriteRows, interactionRows] =
      await Promise.all([
        this.db.select().from(friends).where(eq(friends.userId, id)),
        this.db
          .select()
          .from(friendRequests)
          .where(eq(friendRequests.userId, id)),
        this.db
          .select()
          .from(itemFavorites)
          .where(eq(itemFavorites.userId, id)),
        this.db
          .select()
          .from(userPlaceInteractions)
          .where(eq(userPlaceInteractions.userId, id)),
      ]);

    return {
      ownFriends,
      outgoing,
      favorites: favoriteRows,
      interactions: interactionRows,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Fresh reads of the rows another actor key writes                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Every `friends` row touching this user, in **both** directions: the owned
   * half from the aggregate, the mirrored half read fresh.
   *
   * One indexed select on `friends.friend_id`. Deliberately not cached — the
   * whole of the module doc's "Only the rows this actor *writes* are cached".
   */
  async #friendRows(): Promise<readonly FriendRow[]> {
    const { ownFriends } = this.requireAggregate();
    const reverse = await this.db
      .select()
      .from(friends)
      .where(eq(friends.friendId, this.key));
    return [...ownFriends, ...reverse];
  }

  /**
   * `friend_requests` addressed to me. `friend_requests.user_id` is the
   * requester, so every one of these rows is written — and cancelled — by
   * `UserActor(requester)`. Read fresh, for the same reason.
   */
  async #incomingRequests(): Promise<readonly FriendRequestRow[]> {
    return await this.db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.friendId, this.key));
  }

  /** The owned rows plus both fresh reads, in parallel. */
  async #snapshot(): Promise<UserSnapshot> {
    const { outgoing } = this.requireAggregate();
    const [friendRows, incoming] = await Promise.all([
      this.#friendRows(),
      this.#incomingRequests(),
    ]);
    return {
      friendRows,
      friendships: friendRows.map((row) => ({
        userId: row.userId,
        friendId: row.friendId,
      })),
      outgoing,
      incoming,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Profile                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Visible to any signed-in user — §1.6: "For catalog data the stranger case
   * is 'any signed-in user'; the test still exists." `email` is the part that
   * is *not* catalog data and is returned only to the owner or an admin, which
   * is what gives this method a real owner/friend/stranger distinction.
   */
  async getProfile(ctx: Ctx): Promise<UserProfileDto> {
    this.requireAggregate();
    requireSignedIn(ctx, "view a profile");
    return this.#toProfile(ctx, await this.#profileFields(this.key));
  }

  /** Owner (or admin) only. Proxies to better-auth's `user` table. */
  async updateProfile(
    ctx: Ctx,
    input: UpdateProfileInput,
  ): Promise<UserProfileDto> {
    this.requireAggregate();
    this.#requireSelf(ctx, "update this profile");

    const patch: UpdateProfileInput = {};
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (displayName.length === 0) {
        throw new ValidationError("displayName must not be empty");
      }
      if (displayName.length > MAX_DISPLAY_NAME) {
        throw new ValidationError(
          `displayName must be at most ${MAX_DISPLAY_NAME} characters`,
        );
      }
      // W4 security F2: the display name is shown to every signed-in viewer
      // and the email is not, so the name may not carry one. The same rule as
      // sign-up and better-auth's /update-user (`../auth/display-name.ts`);
      // this is the one writer of `user.name` that is not better-auth.
      if (isEmailShaped(displayName)) {
        throw new ValidationError(
          "displayName must not be an email address: it is shown to other users, and your email is not",
        );
      }
      Object.assign(patch, { displayName });
    }
    if (input.avatarUrl !== undefined) {
      Object.assign(patch, { avatarUrl: normaliseUrl(input.avatarUrl) });
    }
    if (input.locale !== undefined) {
      Object.assign(patch, { locale: normaliseLocale(input.locale) });
    }
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("updateProfile was given nothing to change");
    }

    const updated = await this.#profiles.update(this.key, patch);
    if (updated === null) {
      throw new NotFoundError(`user ${this.key} has no profile row`);
    }
    return this.#toProfile(ctx, updated);
  }

  /* ---------------------------------------------------------------------- */
  /* Friends — reads                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * The friend list, to the owner and to the viewer's own friends. A stranger
   * gets `Forbidden`: who you know is not catalog data.
   *
   * Paged in memory over `#friendRows()` — the owned half from the activation
   * cache, the mirrored half read fresh, because the mirrored half is written
   * by another `UserActor` key (module doc).
   */
  async friends(ctx: Ctx, page: PageArgs): Promise<Page<FriendDto>> {
    this.requireAggregate();
    const friendRows = await this.#friendRows();
    this.#requireSelfOrFriend(ctx, friendRows, "view this friend list");

    const ordered = [...friendRows]
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          this.#otherSide(a).localeCompare(this.#otherSide(b)),
      )
      .map((row) => ({ otherId: this.#otherSide(row), since: row.createdAt }));

    // Both directions are loaded, so a fully-formed friendship appears twice.
    const seen = new Set<string>();
    const unique: typeof ordered = [];
    for (const entry of ordered) {
      if (seen.has(entry.otherId)) continue;
      seen.add(entry.otherId);
      unique.push(entry);
    }

    const slice = offsetPage(unique, page);
    const profiles = await this.#profileMap(
      slice.entries.map((entry) => entry.node.otherId),
    );
    return {
      ...slice,
      entries: slice.entries.map((entry) => ({
        cursor: entry.cursor,
        node: {
          profile: this.#toProfile(
            ctx,
            profiles.get(entry.node.otherId) ??
              missingProfile(entry.node.otherId),
          ),
          since: requiredIso(entry.node.since),
        },
      })),
    };
  }

  /** Your inbox and your outbox are yours alone. Owner (or admin) only. */
  async friendRequests(
    ctx: Ctx,
    direction: FriendRequestDirection,
    page: PageArgs,
  ): Promise<Page<FriendRequestDto>> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "view these friend requests");

    // OUTGOING is this actor's own rows; INCOMING is the requester's, so it is
    // read fresh — a request the sender withdrew must not still be listed.
    const rows =
      direction === "OUTGOING"
        ? aggregate.outgoing
        : await this.#incomingRequests();
    const slice = offsetPage([...rows].sort(byId), page);
    const profiles = await this.#profileMap(
      slice.entries.map((entry) => this.#otherSide(entry.node)),
    );
    return {
      ...slice,
      entries: slice.entries.map((entry) => {
        const otherId = this.#otherSide(entry.node);
        return {
          cursor: entry.cursor,
          node: {
            id: entry.node.id,
            requesterId: entry.node.userId,
            recipientId: entry.node.friendId,
            status: entry.node.status,
            direction,
            otherUser: this.#toProfile(
              ctx,
              profiles.get(otherId) ?? missingProfile(otherId),
            ),
          },
        };
      }),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Friends — the two-sided handshake                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Ask `friendId` to be friends. Writes `friend_requests(user_id = me)`,
   * which is the only friend-request row this actor owns.
   *
   * Four rejections, each with the error §8.3 asks for **and** a `reason`
   * discriminator, because all four otherwise share one `code` and a client
   * that wants to offer "Accept their request" instead of "Send request" would
   * be left substring-matching English prose (D8). Switch on `error.reason`:
   *
   *   - yourself → `Validation` / `CANNOT_FRIEND_SELF`
   *   - already a friend → `Conflict` / `ALREADY_FRIENDS`
   *   - my request is open → `Conflict` / `FRIEND_REQUEST_ALREADY_SENT`
   *   - *their* request is open → `Conflict` / `FRIEND_REQUEST_ALREADY_RECEIVED`
   *
   * The friendship and the incoming request are both read **fresh** here: they
   * are the other user's rows (module doc), and a stale "already friends" is
   * the exact bug D8 reproduced.
   */
  async sendFriendRequest(
    ctx: Ctx,
    requestedFriendId: string,
  ): Promise<FriendRequestDto> {
    this.requireAggregate();
    this.#requireSelf(ctx, "send a friend request as this user");
    // Canonical before any comparison (`../lib/uuid.ts`). Postgres reads
    // `ABC…` and `abc…` as one row, but every check below compares strings
    // against canonical ids (`this.key`, the friend rows), so an uppercase copy
    // of your own id used to pass the self check, the already-friends check
    // and both pending-request checks, and then insert.
    const friendId = requireUuid(requestedFriendId, "friendId");

    if (friendId === this.key) {
      throw new ValidationError(
        "you cannot send yourself a friend request",
        "CANNOT_FRIEND_SELF",
      );
    }
    const snapshot = await this.#snapshot();
    if (this.#areFriends(snapshot.friendships, friendId)) {
      throw new ConflictError(
        `you are already friends with ${friendId}`,
        "ALREADY_FRIENDS",
      );
    }
    const existing = [...snapshot.outgoing, ...snapshot.incoming].find(
      (row) => this.#otherSide(row) === friendId,
    );
    if (existing !== undefined) {
      throw existing.userId === this.key
        ? new ConflictError(
            `you already have a pending friend request to ${friendId}`,
            "FRIEND_REQUEST_ALREADY_SENT",
          )
        : new ConflictError(
            `${friendId} has already sent you a friend request; accept it instead`,
            "FRIEND_REQUEST_ALREADY_RECEIVED",
          );
    }
    if (!(await this.#userExists(friendId))) {
      throw new NotFoundError(`user ${friendId} not found`);
    }

    const [row] = await this.tx(async (tx) =>
      tx
        .insert(friendRequests)
        .values({ userId: this.key, friendId, status: "PENDING" })
        .returning(),
    );
    if (row === undefined) {
      throw new ConflictError(
        `a friend request from ${this.key} to ${friendId} already exists`,
        "FRIEND_REQUEST_ALREADY_SENT",
      );
    }
    await this.reload();

    const profile = await this.#profileFields(friendId);
    return {
      id: row.id,
      requesterId: row.userId,
      recipientId: row.friendId,
      status: row.status,
      direction: "OUTGOING",
      otherUser: this.#toProfile(ctx, profile),
    };
  }

  /**
   * Step 1 of §1.7, run on the **recipient's** actor.
   *
   * Inserts this user's own `friends` row and, in the same transaction, the
   * `outbox` row that will carry `confirmFriendship` to the requester. It does
   * **not** touch `friend_requests`: that row's `user_id` is the requester, so
   * only the requester's actor may close it — which is exactly what step 2
   * does.
   *
   * Idempotent on `friends_pkey`. Calling it again while the request is still
   * open enqueues a second `confirmFriendship`, which is itself idempotent —
   * and that is deliberate: it is the recovery path if the first outbox row
   * dead-letters. Once the requester has confirmed, the request row is gone and
   * a repeat call is a `NotFound`.
   */
  async acceptFriendRequest(
    ctx: Ctx,
    requestedId: string,
  ): Promise<AcceptFriendRequestResult> {
    this.requireAggregate();
    this.#requireSelf(ctx, "accept this friend request");
    const requestId = requireUuid(requestedId, "requestId");

    // Read the row fresh rather than from the activation cache: the requester's
    // actor deletes it from a different turn, and a stale cache would let this
    // one act on a request that is already closed.
    const request = await this.#request(requestId);
    if (request === undefined || request.friendId !== this.key) {
      throw new NotFoundError(
        `friend request ${requestId} is not addressed to you`,
      );
    }
    const requesterId = request.userId;

    const { inserted, outboxRowId: enqueued } = await this.tx(async (tx) => {
      const rows = await tx
        .insert(friends)
        .values({ userId: this.key, friendId: requesterId })
        .onConflictDoNothing()
        .returning({ userId: friends.userId });
      const id = await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["UserActor.confirmFriendship"],
        {
          targetId: requesterId,
          payload: {
            friendId: this.key,
            requestId,
          } satisfies ConfirmFriendshipPayload,
        },
        { attributeTo: ctx },
      );
      return { inserted: rows.length > 0, outboxRowId: id };
    });
    await this.reload();

    return {
      requestId,
      friendId: requesterId,
      friendRowInserted: inserted,
      outboxRowId: enqueued,
    };
  }

  /**
   * Step 2 of §1.7, run on the **requester's** actor, delivered by the outbox.
   *
   * @remarks §8.4 — naturally idempotent, on two unique keys rather than on the
   * outbox row id: the insert is `on conflict (friends_pkey) do nothing`, and
   * the delete matches zero rows once the request is gone. The returned flags
   * say which delivery did the work, so a re-delivery is observably a no-op.
   */
  async confirmFriendship(
    ctx: Ctx,
    payload: ConfirmFriendshipPayload,
  ): Promise<ConfirmFriendshipResult> {
    this.requireAggregate();
    requirePrivileged(ctx, deliveredOnly("confirmFriendship"));
    const friendId = requireUuid(payload?.friendId, "friendId");
    if (friendId === this.key) {
      throw new ValidationError("a user cannot be their own friend");
    }

    const result = await this.tx(async (tx) => {
      const inserted = await tx
        .insert(friends)
        .values({ userId: this.key, friendId })
        .onConflictDoNothing()
        .returning({ userId: friends.userId });
      const closed = await tx
        .delete(friendRequests)
        .where(
          and(
            eq(friendRequests.userId, this.key),
            eq(friendRequests.friendId, friendId),
          ),
        )
        .returning({ id: friendRequests.id });
      return {
        friendRowInserted: inserted.length > 0,
        requestClosed: closed.length > 0,
      };
    });
    await this.reload();

    return { ...result, outboxRowId: deliveryOf(ctx)?.outboxId ?? null };
  }

  /**
   * Decline an incoming request, or cancel one you sent — the frontend calls
   * both "delete the request" and the row is the same row either way.
   *
   * The two cases are not symmetric, because `friend_requests.user_id` is the
   * requester and only the requester's actor may write the row:
   *
   *   - **cancel** (I am the requester): delete it here, directly.
   *   - **decline** (I am the recipient): enqueue `withdrawFriendRequest` on
   *     the requester's actor. Nothing is deleted in this turn.
   *
   * Returns whether the row was deleted *in this turn* — `false` for a decline
   * means "handed to the outbox", not "nothing happened".
   */
  async rejectFriendRequest(ctx: Ctx, requestedId: string): Promise<boolean> {
    this.requireAggregate();
    this.#requireSelf(ctx, "reject this friend request");
    const requestId = requireUuid(requestedId, "requestId");

    const request = await this.#request(requestId);
    if (
      request === undefined ||
      (request.userId !== this.key && request.friendId !== this.key)
    ) {
      throw new NotFoundError(`friend request ${requestId} not found`);
    }

    if (request.userId === this.key) {
      const deleted = await this.tx(async (tx) =>
        tx
          .delete(friendRequests)
          .where(eq(friendRequests.id, requestId))
          .returning({ id: friendRequests.id }),
      );
      await this.reload();
      return deleted.length > 0;
    }

    await this.tx(async (tx) => {
      await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["UserActor.withdrawFriendRequest"],
        {
          targetId: request.userId,
          payload: { friendId: this.key } satisfies OtherSidePayload,
        },
        { attributeTo: ctx },
      );
    });
    return false;
  }

  /**
   * The system half of a decline: the requester's actor drops its own row.
   *
   * @remarks §8.4 — naturally idempotent: deleting an absent row is a no-op.
   */
  async withdrawFriendRequest(
    ctx: Ctx,
    payload: OtherSidePayload,
  ): Promise<boolean> {
    this.requireAggregate();
    requirePrivileged(ctx, deliveredOnly("withdrawFriendRequest"));
    const friendId = requireUuid(payload?.friendId, "friendId");

    const deleted = await this.tx(async (tx) =>
      tx
        .delete(friendRequests)
        .where(
          and(
            eq(friendRequests.userId, this.key),
            eq(friendRequests.friendId, friendId),
          ),
        )
        .returning({ id: friendRequests.id }),
    );
    await this.reload();
    return deleted.length > 0;
  }

  /**
   * End the friendship — **both rows, in one transaction** — and tell the other
   * side's activation to reload.
   *
   * ## Why this one statement crosses an aggregate boundary, and nothing else does
   *
   * Every other two-sided operation in this file writes one row and lets the
   * outbox write the mirror, because §1.2 forbids writing another aggregate's
   * rows. E2d measured what that costs a *removal* against the running stack
   * (`removeFriend` through `services/api`, `friends` polled straight from
   * Postgres): the mutation answered `RemoveFriendPayload {removed: true}` in
   * **7–9ms** while `friends(other, me)` was **still committed**, and because
   * `isFriend` matches *either* direction on purpose (module doc — do not
   * change that), every read path kept serving the friendship for another
   * **1977–1989ms**. `myFriends` — the query `/friends` actually runs — still
   * listed the removed friend until **1984–1996ms** after its own success, in
   * 4 runs out of 4. That is the cross-run flakiness `packages/e2e/fixtures/data.ts`
   * polls around, and the ~2s is not incidental: it is the outbox's own
   * `drain reminder every 2s`.
   *
   * After the change, the same script over 4 runs: zero rows at **+0–1ms**,
   * and `myFriends` clean at **+4–8ms** — one HTTP round trip, not a reminder
   * tick.
   *
   * The asymmetry is also a security hazard and not only a UI one —
   * target-stack's "a dead-lettered `removeFriendOtherSide` fails open": the
   * surviving row keeps `isFriend` true, so an unfriended person **retains
   * FRIENDS-visible access** until the mirror delete is delivered, and forever
   * if it dead-letters.
   *
   * Fixing it in the five read paths instead (`#friendRows` here,
   * `visibility.ts`, `CellarActor`, `TierListActor`,
   * `FriendsCollectionActor`) would put an outbox lookup on every visibility
   * read and leave a sixth path free to forget it. One delete cannot be
   * forgotten.
   *
   * This does **not** add a writer: `TABLE_WRITERS` names `UserActor` as the
   * sole writing *class* of `friends` and still does. What it gives up is
   * §1.2's finer "not another aggregate's rows", for a statement that is
   * idempotent, monotone (nothing here ever creates a `friends` row), and races
   * with nothing the other actor may write except the accept-during-removal
   * race that already existed.
   *
   * The outbox row **stays**, and its job changes: Bob's row is already gone,
   * so `removeFriendOtherSide` is now his activation's *invalidation*.
   * `UserActor(bob)` caches `friends(bob, *)` because it writes them (§1.3) and
   * a delete from here cannot invalidate that cache — but that method reloads
   * unconditionally, so delivery still does. That cached copy is the whole
   * residual window now, bounded by one actor's own aggregate instead of by
   * every read path in the system.
   */
  async removeFriend(ctx: Ctx, requestedFriendId: string): Promise<boolean> {
    this.requireAggregate();
    this.#requireSelf(ctx, "remove this friend");
    // Canonical: `#areFriends` compares strings, and `friendId` becomes the
    // outbox row's `targetId` — an actor key, which must be lowercase.
    const friendId = requireUuid(requestedFriendId, "friendId");

    if (!this.#areFriends(await this.#friendRows(), friendId)) {
      throw new NotFoundError(`you are not friends with ${friendId}`);
    }

    const deleted = await this.tx(async (tx) => {
      const rows = await tx
        .delete(friends)
        .where(
          or(
            and(eq(friends.userId, this.key), eq(friends.friendId, friendId)),
            and(eq(friends.userId, friendId), eq(friends.friendId, this.key)),
          ),
        )
        .returning({ userId: friends.userId });
      // Enqueued even when both rows were already gone: a half-removed
      // friendship is exactly the state this call is meant to finish, and the
      // other side's activation has to be told to reload either way.
      await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["UserActor.removeFriendOtherSide"],
        {
          targetId: friendId,
          payload: { friendId: this.key } satisfies OtherSidePayload,
        },
        { attributeTo: ctx },
      );
      return rows.length > 0;
    });
    await this.reload();
    return deleted;
  }

  /**
   * The system half of `removeFriend` — now its **backstop and cache
   * invalidation** rather than the delete that makes the removal true.
   *
   * `removeFriend` has already dropped both rows by the time this arrives, so
   * the delete below normally matches nothing and this returns `false`. It is
   * still the thing that calls `reload()` on the other side's activation, which
   * is the only stale copy left, and it still repairs a legacy half-state left
   * by an older `removeFriend`.
   *
   * Deliberately still one-sided: a `system` ctx could delete both directions,
   * but widening it would make a redelivery that lands *after* the two have
   * re-friended destroy the new friendship's rows instead of one of them.
   *
   * @remarks §8.4 — naturally idempotent: deleting an absent row is a no-op.
   */
  async removeFriendOtherSide(
    ctx: Ctx,
    payload: OtherSidePayload,
  ): Promise<boolean> {
    this.requireAggregate();
    requirePrivileged(ctx, deliveredOnly("removeFriendOtherSide"));
    const friendId = requireUuid(payload?.friendId, "friendId");

    const deleted = await this.tx(async (tx) =>
      tx
        .delete(friends)
        .where(
          and(eq(friends.userId, this.key), eq(friends.friendId, friendId)),
        )
        .returning({ userId: friends.userId }),
    );
    await this.reload();
    return deleted.length > 0;
  }

  /* ---------------------------------------------------------------------- */
  /* Favorites                                                               */
  /* ---------------------------------------------------------------------- */

  /** Owner (or admin) only — a favourites list is not shared with friends. */
  async favorites(ctx: Ctx, page: PageArgs): Promise<Page<ItemRef>> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "view these favourites");
    const refs = [...aggregate.favorites]
      .sort(byCreatedAtDesc)
      .map(favoriteRef)
      .filter((ref): ref is ItemRef => ref !== null);
    return offsetPage(refs, page);
  }

  /**
   * Which of `refs` this user has favourited, as `ItemActor` ids (A7c (7)).
   *
   * The batch is the point: `Item.isFavorite` is drawn once per card in a
   * grid, and one call per card would be one sidecar hop per card, run in
   * series because Dapr gives an actor id one turn at a time. `favorites` is
   * already in memory — this actor writes every one of those rows, which is
   * what makes caching them legal (§1.3) — so the whole page costs one call
   * and no query.
   */
  async favoriteStates(
    ctx: Ctx,
    refs: readonly ItemRef[],
  ): Promise<readonly string[]> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "view these favourites");
    if (!Array.isArray(refs)) {
      throw new ValidationError("favoriteStates takes a list of item refs");
    }

    const favorited = new Set<string>();
    for (const row of aggregate.favorites) {
      const ref = favoriteRef(row);
      if (ref !== null) favorited.add(itemActorId(ref));
    }

    const answer: string[] = [];
    for (const ref of refs) {
      if (typeof ref?.type !== "string" || !isItemType(ref.type)) {
        throw new ValidationError(`not an item type: ${String(ref?.type)}`);
      }
      const key = itemActorId({
        type: ref.type,
        id: requireUuid(ref.id, "ref.id"),
      });
      if (favorited.has(key)) answer.push(key);
    }
    return answer;
  }

  /**
   * UI parity G6 — how many users favourited each ref, aligned with `refs`.
   *
   * The viewer's own actor answers because this class is `item_favorites`'
   * one writer, and one call covers a whole page of cards (the alternative,
   * a call per item, is N sidecar hops for one number each). The count spans
   * every user's rows, and only this key's rows are cached (module doc), so it
   * is a fresh `group by` over the six item columns — one query, whatever the
   * page size. A count names nobody, so the per-row "mine" rule on
   * `item_favorites` is not widened; the item itself is catalog data any
   * signed-in viewer may read, which is the same bar `#requireSelf` sets here.
   */
  async favoriteCounts(
    ctx: Ctx,
    refs: readonly ItemRef[],
  ): Promise<readonly number[]> {
    this.requireAggregate();
    this.#requireSelf(ctx, "count favourites");
    if (!Array.isArray(refs)) {
      throw new ValidationError("favoriteCounts takes a list of item refs");
    }
    const keys = refs.map((ref) => {
      if (typeof ref?.type !== "string" || !isItemType(ref.type)) {
        throw new ValidationError(`not an item type: ${String(ref?.type)}`);
      }
      return { type: ref.type, id: requireUuid(ref.id, "ref.id") };
    });
    if (keys.length === 0) return [];

    const arc = ARCS.itemFavorites;
    const byType = new Map<ItemRef["type"], string[]>();
    for (const key of keys) {
      byType.set(key.type, [...(byType.get(key.type) ?? []), key.id]);
    }
    const rows = await this.db
      .select({
        itemId: sql<string>`${arc.idExpr()}`,
        count: sql<number>`count(*)::int`,
      })
      .from(itemFavorites)
      .where(
        or(
          ...[...byType.entries()].map(([type, ids]) =>
            inArray(arc.columns[type], ids),
          ),
        ),
      )
      .groupBy(sql`${arc.idExpr()}`);

    const counts = new Map(rows.map((row) => [row.itemId, Number(row.count)]));
    return keys.map((key) => counts.get(key.id) ?? 0);
  }

  /**
   * Add or remove one favourite, returning the state after the toggle.
   *
   * Read-then-write is safe here because Dapr runs one turn at a time per
   * actor id and every `item_favorites` row this touches has
   * `user_id = this.key`, so the cached `favorites` this checks cannot go
   * stale between the read and the insert. The database backs that up rather
   * than being relied on: all six item columns carry a
   * `item_favorites_user_id_<type>_id_key` unique constraint (sake and tea
   * since `packages/db/transform/08_item_favorites_missing_uniques.sql`, and
   * in the `packages/db` baseline migration and schema), so a double
   * insert that somehow got past the turn lock would fail loudly as a unique
   * violation instead of leaving a duplicate row — not be absorbed as an
   * idempotent toggle.
   */
  async toggleFavorite(
    ctx: Ctx,
    requested: ItemRef,
  ): Promise<ToggleFavoriteResult> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "change these favourites");
    if (typeof requested?.type !== "string" || !isItemType(requested.type)) {
      throw new ValidationError(`not an item type: ${String(requested?.type)}`);
    }
    // Canonical, because the lookup below is `===` against the cached rows:
    // an uppercase id used to miss an existing favourite, fall through to the
    // insert, and fail on `item_favorites_user_id_<type>_id_key` (23505).
    const ref: ItemRef = {
      type: requested.type,
      id: requireUuid(requested.id, "ref.id"),
    };

    const existing = aggregate.favorites.find((row) => {
      const current = favoriteRef(row);
      return (
        current !== null && current.type === ref.type && current.id === ref.id
      );
    });

    if (existing !== undefined) {
      await this.tx(async (tx) => {
        await tx.delete(itemFavorites).where(eq(itemFavorites.id, existing.id));
      });
      await this.reload();
      return { ref, favorited: false };
    }

    if (!(await this.#itemExists(ref))) {
      throw new NotFoundError(`${ref.type.toLowerCase()} ${ref.id} not found`);
    }
    await this.tx(async (tx) => {
      await tx.insert(itemFavorites).values(favoriteValues(this.key, ref));
    });
    await this.reload();
    return { ref, favorited: true };
  }

  /* ---------------------------------------------------------------------- */
  /* Place interactions                                                      */
  /* ---------------------------------------------------------------------- */

  /** Owner (or admin) only. Where you have been is not friends-visible. */
  async placeInteractions(
    ctx: Ctx,
    page: PageArgs,
  ): Promise<Page<PlaceInteractionDto>> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "view these place interactions");
    return offsetPage(
      [...aggregate.interactions].sort(byCreatedAtDesc).map(toInteractionDto),
      page,
    );
  }

  /** Owner (or admin) only. `null` when the user has never touched the place. */
  async placeInteraction(
    ctx: Ctx,
    placeId: string,
  ): Promise<PlaceInteractionDto | null> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "view this place interaction");
    const id = requireUuid(placeId, "placeId");
    const row = aggregate.interactions.find((r) => r.placeId === id);
    return row === undefined ? null : toInteractionDto(row);
  }

  /**
   * UI parity G16 — this user's rows for a page of places, behind
   * `Place.myInteraction`: the tier-list board's own rating and the map
   * drawer's saved/visited state, for every place on the page in **one**
   * call. Answered from the rows this actor already holds (it writes every
   * one of them, §1.3), so it costs no query — the same reasoning as
   * `favoriteStates`.
   *
   * Owner (or admin) only: where you have been is not friends-visible. The
   * matching subset, in the order asked; a place the user never touched is
   * absent rather than `null`.
   */
  async placeInteractionsFor(
    ctx: Ctx,
    placeIds: readonly string[],
  ): Promise<readonly PlaceInteractionDto[]> {
    const aggregate = this.requireAggregate();
    this.#requireSelf(ctx, "view these place interactions");
    if (!Array.isArray(placeIds)) {
      throw new ValidationError(
        "placeInteractionsFor takes a list of place ids",
      );
    }
    requireReverseEdgeBatch(placeIds, "placeInteractionsFor placeIds");
    const byPlace = new Map(
      aggregate.interactions.map((row) => [row.placeId, row]),
    );
    const answer: PlaceInteractionDto[] = [];
    const seen = new Set<string>();
    for (const placeId of placeIds) {
      const id = requireUuid(placeId, "placeId");
      if (seen.has(id)) continue;
      seen.add(id);
      const row = byPlace.get(id);
      if (row !== undefined) answer.push(toInteractionDto(row));
    }
    return answer;
  }

  /**
   * Upsert this user's row for a place.
   *
   * **`visitCount` is computed here and is not an input** (§2.1: "visit count
   * is computed here, never client-supplied"). Today the browser reads the
   * count, adds one and posts it back — two tabs, or one retried mutation, and
   * the count is wrong, and nothing stops a client posting `visit_count: 9999`.
   *
   * The rule: the count increments, and `lastVisitedAt` moves, only on the
   * **transition** from not-visited to visited. That makes the operation
   * idempotent — pressing "visited" twice is one visit, which is also what the
   * old client did by accident and what a user expects.
   */
  async recordPlaceInteraction(
    ctx: Ctx,
    input: RecordPlaceInteractionInput,
  ): Promise<PlaceInteractionDto> {
    this.requireAggregate();
    this.#requireSelf(ctx, "record this place interaction");
    const placeId = requireUuid(input?.placeId, "placeId");

    if (input.rating !== undefined && input.rating !== null) {
      if (
        !Number.isInteger(input.rating) ||
        input.rating < 1 ||
        input.rating > 5
      ) {
        throw new ValidationError(
          `rating must be an integer 1–5, got ${String(input.rating)}`,
        );
      }
    }
    if (input.notes != null && input.notes.length > MAX_NOTES) {
      throw new ValidationError(
        `notes must be at most ${MAX_NOTES} characters`,
      );
    }
    const tags =
      input.tags === undefined
        ? undefined
        : input.tags === null
          ? null
          : normaliseTags(input.tags);

    if (!(await this.#placeExists(placeId))) {
      throw new NotFoundError(`place ${placeId} not found`);
    }

    const row = await this.tx(async (tx) => {
      // Read inside the transaction so the computed count is derived from
      // committed state, not from the activation cache.
      const [current] = await tx
        .select()
        .from(userPlaceInteractions)
        .where(
          and(
            eq(userPlaceInteractions.userId, this.key),
            eq(userPlaceInteractions.placeId, placeId),
          ),
        );

      const wasVisited = current?.isVisited ?? false;
      const willBeVisited = input.isVisited ?? wasVisited;
      const visitLogged = willBeVisited && !wasVisited;
      const visitCount = (current?.visitCount ?? 0) + (visitLogged ? 1 : 0);
      const lastVisitedAt = visitLogged
        ? new Date()
        : (current?.lastVisitedAt ?? null);

      const values = {
        userId: this.key,
        placeId,
        isFavorite: input.isFavorite ?? current?.isFavorite ?? false,
        isVisited: willBeVisited,
        wantToVisit: input.wantToVisit ?? current?.wantToVisit ?? false,
        rating:
          input.rating === undefined ? (current?.rating ?? null) : input.rating,
        notes:
          input.notes === undefined ? (current?.notes ?? null) : input.notes,
        tags: tags === undefined ? (current?.tags ?? null) : tags,
        visitCount,
        lastVisitedAt,
        updatedAt: new Date(),
      };

      const [written] = await tx
        .insert(userPlaceInteractions)
        .values(values)
        .onConflictDoUpdate({
          target: [userPlaceInteractions.userId, userPlaceInteractions.placeId],
          set: {
            isFavorite: values.isFavorite,
            isVisited: values.isVisited,
            wantToVisit: values.wantToVisit,
            rating: values.rating,
            notes: values.notes,
            tags: values.tags,
            visitCount: values.visitCount,
            lastVisitedAt: values.lastVisitedAt,
            updatedAt: values.updatedAt,
          },
        })
        .returning();
      if (written === undefined) {
        throw new ConflictError(
          `could not record an interaction for place ${placeId}`,
        );
      }
      return written;
    });
    await this.reload();
    return toInteractionDto(row);
  }

  /* ---------------------------------------------------------------------- */
  /* Policy helpers                                                          */
  /* ---------------------------------------------------------------------- */

  /** Owner, admin or system. `isOwner` already covers the last two (§1.6). */
  #requireSelf(ctx: Ctx, what: string): void {
    if (isOwner(ctx, this.key)) return;
    throw new ForbiddenError(`only ${this.key} may ${what}`);
  }

  /** `friendRows` must be `#friendRows()`' output — both directions, fresh. */
  #requireSelfOrFriend(
    ctx: Ctx,
    friendRows: readonly FriendRow[],
    what: string,
  ): void {
    if (isOwner(ctx, this.key)) return;
    // `isFriend` deliberately does not short-circuit for admin/system (§1.6);
    // `isOwner` above already let both through.
    if (isFriend(ctx, this.key, friendRows)) return;
    throw new ForbiddenError(`only ${this.key} and their friends may ${what}`);
  }

  /* ---------------------------------------------------------------------- */
  /* Small helpers                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Either direction counts, deliberately (§1.7, and `packages/policy`'s
   * `isFriend`): between the two halves of an acceptance — or of a removal —
   * exactly one row exists, and a one-directional answer would flicker for the
   * width of the outbox window.
   *
   * Takes the rows rather than reading them, so the caller decides how fresh
   * they are; every caller passes `#friendRows()`.
   */
  #areFriends(
    friendships: readonly Friendship[],
    otherUserId: string,
  ): boolean {
    return friendships.some(
      (row) =>
        (row.userId === this.key && row.friendId === otherUserId) ||
        (row.userId === otherUserId && row.friendId === this.key),
    );
  }

  /** The other end of a `friends` or `friend_requests` row, from here. */
  #otherSide(row: { userId: string; friendId: string }): string {
    return row.userId === this.key ? row.friendId : row.userId;
  }

  async #request(requestId: string): Promise<FriendRequestRow | undefined> {
    const [row] = await this.db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId));
    return row;
  }

  async #userExists(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, userId));
    return row !== undefined;
  }

  async #placeExists(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(eq(places.id, placeId));
    return row !== undefined;
  }

  /**
   * Whether the item behind a favourite exists. A read of another aggregate's
   * table, which §1.1 allows — the rule is about writes. It buys a typed
   * `NotFound` instead of a raw foreign-key violation reaching GraphQL.
   */
  async #itemExists(ref: ItemRef): Promise<boolean> {
    const table = ITEM_TABLES[ref.type];
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, ref.id));
    return row !== undefined;
  }

  async #profileFields(userId: string): Promise<ProfileFields> {
    const found = (await this.#profiles.load([userId])).get(userId);
    return found ?? missingProfile(userId);
  }

  async #profileMap(
    userIds: readonly string[],
  ): Promise<Map<string, ProfileFields>> {
    return userIds.length === 0
      ? new Map()
      : await this.#profiles.load(userIds);
  }

  /** `email` is owner/admin only; everybody else sees `null`. */
  #toProfile(ctx: Ctx, fields: ProfileFields): UserProfileDto {
    return {
      id: fields.id,
      displayName: fields.displayName,
      avatarUrl: fields.avatarUrl,
      locale: fields.locale,
      email: isOwner(ctx, fields.id) ? fields.email : null,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Module-level helpers                                                       */
/* -------------------------------------------------------------------------- */

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id.localeCompare(b.id);

const byCreatedAtDesc = (
  a: { createdAt: Date | null },
  b: { createdAt: Date | null },
): number => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);

const toInteractionDto = (row: PlaceInteractionRow): PlaceInteractionDto => ({
  id: row.id,
  placeId: row.placeId,
  isFavorite: row.isFavorite ?? false,
  isVisited: row.isVisited ?? false,
  wantToVisit: row.wantToVisit ?? false,
  rating: row.rating ?? null,
  notes: row.notes ?? null,
  tags: row.tags ?? [],
  lastVisitedAt: iso(row.lastVisitedAt),
  visitCount: row.visitCount ?? 0,
  createdAt: requiredIso(row.createdAt),
  updatedAt: requiredIso(row.updatedAt),
});

/**
 * A placeholder for a user whose profile row is missing.
 *
 * B4 added this because `auth.users` and better-auth's `user` were two tables in
 * two databases and a row could exist in one and not the other. X2 merged them,
 * so that case is gone: `loadAggregate` checks existence against the same row
 * the profile comes from. What is left is the narrower one — a `friends` or
 * `friend_requests` row naming a user deleted out from under it (both foreign
 * keys are `ON DELETE RESTRICT`, so it takes a deliberate cascade or a manual
 * delete). A friend list that threw on the first such id would be unusable;
 * showing the id is honest and recoverable.
 */
const missingProfile = (userId: string): ProfileFields => ({
  id: userId,
  displayName: userId,
  avatarUrl: null,
  locale: null,
  email: null,
});

const normaliseUrl = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError(`avatarUrl is not a URL: ${trimmed}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError("avatarUrl must be http(s)");
  }
  return parsed.toString();
};

const normaliseLocale = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;
  // Nhost's `auth.users.locale` was `varchar(3)`, so anything longer was
  // silently truncated by Postgres — worse than refusing it. `"user".locale` is
  // `text` and would keep whatever it was given, which is exactly why the
  // check stays: the shape of the value is the application's rule, not the
  // column's.
  if (!/^[a-z]{2,3}$/.test(trimmed)) {
    throw new ValidationError(
      `locale must be a 2–3 letter code, got "${value}"`,
    );
  }
  return trimmed;
};

const normaliseTags = (tags: readonly string[]): string[] => {
  const cleaned = [
    ...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== "")),
  ];
  if (cleaned.length > MAX_TAGS) {
    throw new ValidationError(`at most ${MAX_TAGS} tags`);
  }
  return cleaned;
};
