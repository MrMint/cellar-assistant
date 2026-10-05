/**
 * The `User` aggregate as `services/api` sees it (migration plan §2.1 `UserActor`,
 * §1.7, B4).
 *
 * `UserActor(userId)` owns four tables — `friends` and `friend_requests` (rows
 * where `user_id` is *this* user), `item_favorites` and
 * `user_place_interactions`. Profile fields are **not** among them: there is no
 * `public.users` table, and A6 moved identity to better-auth's `user` table
 * (`services/actors/src/auth/README.md`). `getProfile`/`updateProfile` therefore
 * proxy to better-auth rather than reading a table this actor owns.
 *
 * ## The two-sided friendship, in the type system
 *
 * `friends` is directed: one row per direction, and **no actor writes another
 * user's rows, even inside a transaction** (§1.2). So acceptance is two
 * idempotent calls (§1.7):
 *
 * 1. the recipient's `acceptFriendRequest` inserts *its own* `friends` row and,
 *    in the same transaction, an `outbox` row targeting
 *    `UserActor(requesterId).confirmFriendship`;
 * 2. the outbox delivers; the requester's actor inserts *its* row and closes
 *    the `friend_requests` row — which only it may write, because
 *    `friend_requests.user_id` is the requester.
 *
 * `rejectFriendRequest` / `withdrawFriendRequest` is the same shape. Every
 * `system` method below is reachable only from the outbox, and every one of
 * them is idempotent on a unique key, because delivery is at least once (§8.4).
 *
 * **`removeFriend` is deliberately not that shape (E2d).** It deletes both
 * `friends` rows in one transaction, so a caller's own next read sees the
 * removal, and `removeFriendOtherSide` degrades to reloading the other side's
 * activation. The reason is that `isFriend` matches either direction: a
 * half-delivered *acceptance* therefore reads as "friends", which is right,
 * while a half-delivered *removal* also reads as "friends", which is both
 * wrong and (target-stack's dead-letter note) fail-open. See
 * `services/actors/src/actors/user-actor.ts`.
 *
 * **These DTOs are the wire shape, not the row shape**: `timestamptz` crosses
 * the Dapr wire as an ISO-8601 string, because `services/api` has no Drizzle.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { FriendRequestStatus } from "./enums.ts";
import type { ItemRef } from "./items.ts";
import type { Page, PageArgs } from "./page.ts";

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What every surface that names a user shows: the friend list, a friend
 * request, user search.
 *
 * `email` is **viewer-dependent** — non-null for the owner and for an admin,
 * `null` for a friend and for a stranger. That is deliberate: it gives
 * `getProfile` an owner/friend/stranger distinction to test (§1.6) rather than
 * a rule that is the same for everyone.
 */
export type UserProfileDto = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly locale: string | null;
  /** Owner or admin only; `null` for every other viewer. */
  readonly email: string | null;
};

/** The mutable half. Every field is optional; omitted means unchanged. */
export type UpdateProfileInput = {
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly locale?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Friends                                                                     */
/* -------------------------------------------------------------------------- */

/** One entry of `UserActor.friends` — the *other* user, and when it started. */
export type FriendDto = {
  readonly profile: UserProfileDto;
  /** ISO-8601. `friends.created_at` of whichever row this actor can see. */
  readonly since: string;
};

/**
 * Relative to the actor's own user, never to the row: `friend_requests.user_id`
 * is always the requester, so a row is `OUTGOING` for the requester's actor and
 * `INCOMING` for the recipient's.
 */
export const FRIEND_REQUEST_DIRECTIONS = ["INCOMING", "OUTGOING"] as const;
export type FriendRequestDirection = (typeof FRIEND_REQUEST_DIRECTIONS)[number];

export type FriendRequestDto = {
  readonly id: string;
  /** `friend_requests.user_id`. */
  readonly requesterId: string;
  /** `friend_requests.friend_id`. */
  readonly recipientId: string;
  readonly status: FriendRequestStatus;
  readonly direction: FriendRequestDirection;
  /** The user on the other end, from this actor's point of view. */
  readonly otherUser: UserProfileDto;
};

/**
 * The outbox payload for `confirmFriendship`.
 *
 * §1.7 writes this call as `confirmFriendship(system, recipientId)`. It cannot
 * be a bare id: `enqueueOutbox` types `payload` as `Record<string, unknown>`
 * and `OutboxActor.deliver` invokes exactly `method(systemCtx, payload)`, so
 * the second argument is always one JSON object.
 */
export type ConfirmFriendshipPayload = {
  /** The user who accepted — the *other* side of the friendship. */
  readonly friendId: string;
  /** The `friend_requests` row to close. Absent only for a hand-driven repair. */
  readonly requestId?: string;
};

/**
 * What `confirmFriendship` reports, so a re-delivery is *observably* a no-op
 * rather than merely believed to be one.
 */
export type ConfirmFriendshipResult = {
  /** `true` on the delivery that actually inserted the requester's row. */
  readonly friendRowInserted: boolean;
  /** `true` on the delivery that actually deleted the `friend_requests` row. */
  readonly requestClosed: boolean;
  /** The `outbox` row that carried this call, or `null` if invoked directly. */
  readonly outboxRowId: string | null;
};

/** The payload of both `removeFriendOtherSide` and `withdrawFriendRequest`. */
export type OtherSidePayload = {
  /** The user on the other end, from the receiving actor's point of view. */
  readonly friendId: string;
};

export type AcceptFriendRequestResult = {
  readonly requestId: string;
  /** The requester — the actor the outbox row targets. */
  readonly friendId: string;
  /** `true` when this call inserted the recipient's `friends` row. */
  readonly friendRowInserted: boolean;
  /** The `outbox` row that will carry `confirmFriendship`. */
  readonly outboxRowId: string;
};

/* -------------------------------------------------------------------------- */
/* Favorites and place interactions                                            */
/* -------------------------------------------------------------------------- */

export type ToggleFavoriteResult = {
  readonly ref: ItemRef;
  /** State *after* the toggle. */
  readonly favorited: boolean;
};

/**
 * One `user_place_interactions` row.
 *
 * `visitCount` is **not** an input anywhere: §2.1 — "visit count is computed
 * here, never client-supplied". Today the browser reads it, adds one and posts
 * it back; that ends with this actor.
 */
export type PlaceInteractionDto = {
  readonly id: string;
  readonly placeId: string;
  readonly isFavorite: boolean;
  readonly isVisited: boolean;
  readonly wantToVisit: boolean;
  readonly rating: number | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  /** ISO-8601, or `null` if never marked visited. */
  readonly lastVisitedAt: string | null;
  readonly visitCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** Everything a client may say about a place. Note the absence of `visitCount`. */
export type RecordPlaceInteractionInput = {
  readonly placeId: string;
  readonly isFavorite?: boolean;
  readonly isVisited?: boolean;
  readonly wantToVisit?: boolean;
  /** 1–5, per the table's own check constraint. `null` clears it. */
  readonly rating?: number | null;
  readonly notes?: string | null;
  readonly tags?: readonly string[] | null;
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `UserActor(userId)` — entity actor, §2.1.
 *
 * Three of these methods take a `system` ctx and are reachable only from the
 * outbox: `confirmFriendship`, `removeFriendOtherSide`, `withdrawFriendRequest`.
 * They are declared here because the descriptor's interface is the contract,
 * but `services/api` can never call them — `makeActorClient` refuses to bind a
 * `system` ctx (§1.6), so a request-built proxy always passes `user`/`admin`
 * and each method rejects that.
 */
export type UserActorInterface = {
  getProfile(ctx: Ctx): Promise<UserProfileDto>;
  updateProfile(ctx: Ctx, input: UpdateProfileInput): Promise<UserProfileDto>;

  friends(ctx: Ctx, page: PageArgs): Promise<Page<FriendDto>>;
  friendRequests(
    ctx: Ctx,
    direction: FriendRequestDirection,
    page: PageArgs,
  ): Promise<Page<FriendRequestDto>>;

  sendFriendRequest(ctx: Ctx, friendId: string): Promise<FriendRequestDto>;
  acceptFriendRequest(
    ctx: Ctx,
    requestId: string,
  ): Promise<AcceptFriendRequestResult>;
  confirmFriendship(
    ctx: Ctx,
    payload: ConfirmFriendshipPayload,
  ): Promise<ConfirmFriendshipResult>;
  rejectFriendRequest(ctx: Ctx, requestId: string): Promise<boolean>;
  withdrawFriendRequest(ctx: Ctx, payload: OtherSidePayload): Promise<boolean>;
  removeFriend(ctx: Ctx, friendId: string): Promise<boolean>;
  removeFriendOtherSide(ctx: Ctx, payload: OtherSidePayload): Promise<boolean>;

  favorites(ctx: Ctx, page: PageArgs): Promise<Page<ItemRef>>;
  /**
   * Which of `refs` the viewer has favourited, as `ItemActor` ids
   * (`wine:<uuid>`) — A7c (7), behind `Item.isFavorite`.
   *
   * **Takes a list on purpose.** A grid of twenty items asking one at a time
   * would be twenty sidecar hops, and Dapr runs one turn at a time per actor
   * id, so they would run in *series*. One call per request answers the whole
   * page from rows the actor already holds in memory.
   *
   * Returns the matching subset rather than an array of booleans aligned to
   * the input, so a caller cannot silently misread the answer if the two ever
   * disagree in length.
   */
  favoriteStates(
    ctx: Ctx,
    refs: readonly ItemRef[],
  ): Promise<readonly string[]>;
  /**
   * UI parity G6: how many users have favourited each of `refs` — the old
   * card's `item_favorites_aggregate.count`. Answered by the viewer's own actor
   * because `UserActor` is `item_favorites`' writer, so one call covers a page
   * of cards; the count spans **every** user's rows, which this actor does not
   * cache (§1.3) and so reads fresh. A count names nobody, so it widens nothing
   * the per-row "mine" rule hides. Same length and order as `refs`.
   */
  favoriteCounts(
    ctx: Ctx,
    refs: readonly ItemRef[],
  ): Promise<readonly number[]>;
  toggleFavorite(ctx: Ctx, ref: ItemRef): Promise<ToggleFavoriteResult>;

  placeInteractions(
    ctx: Ctx,
    page: PageArgs,
  ): Promise<Page<PlaceInteractionDto>>;
  placeInteraction(
    ctx: Ctx,
    placeId: string,
  ): Promise<PlaceInteractionDto | null>;
  /**
   * UI parity G16 — the viewer's rows for a page of places, behind
   * `Place.myInteraction` (the tier-list board's own rating, the map drawer's
   * saved/visited state). One call per request, answered from rows this actor
   * already holds, as `favoriteStates` is.
   *
   * Returns the matching subset — places the viewer never touched are simply
   * absent — rather than an array aligned to the input, for the reason
   * `favoriteStates` gives. Owner (or admin) only.
   */
  placeInteractionsFor(
    ctx: Ctx,
    placeIds: readonly string[],
  ): Promise<readonly PlaceInteractionDto[]>;
  recordPlaceInteraction(
    ctx: Ctx,
    input: RecordPlaceInteractionInput,
  ): Promise<PlaceInteractionDto>;
};

export const UserActorDescriptor: ActorDescriptor<UserActorInterface> = {
  actorType: "UserActor",
  category: "entity",
  methods: {
    getProfile: {},
    updateProfile: {},
    friends: {},
    friendRequests: {},
    sendFriendRequest: {},
    acceptFriendRequest: {},
    confirmFriendship: {},
    rejectFriendRequest: {},
    withdrawFriendRequest: {},
    removeFriend: {},
    removeFriendOtherSide: {},
    favorites: {},
    favoriteStates: {},
    favoriteCounts: {},
    toggleFavorite: {},
    placeInteractions: {},
    placeInteraction: {},
    placeInteractionsFor: {},
    recordPlaceInteraction: {},
  },
};
