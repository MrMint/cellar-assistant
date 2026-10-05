/**
 * The user aggregate's GraphQL surface — B4 (migration plan §2.1, §1.7, §8.3).
 *
 * Every field here is one `UserActor` call. There is no database in this
 * process and no visibility decision in this file: the resolver passes `ctx`
 * through (§8.2) and the actor answers, including by refusing.
 *
 * ## Two things worth noticing about the friend mutations
 *
 * **The actor id is always the viewer.** `acceptFriendRequest` is addressed to
 * the *recipient's* actor, `sendFriendRequest` to the *requester's* — and both
 * of those are the person making the request. That is not a coincidence: §1.2
 * says an actor writes only its own rows, so the only actor a user's command
 * can be addressed to is their own. The `requestId`/`userId` arguments name the
 * other party; they never redirect the call.
 *
 * **The other half is not here.** `confirmFriendship`,
 * `removeFriendOtherSide` and `withdrawFriendRequest` are on the actor and
 * deliberately absent from this schema: they take a `system` ctx, the outbox is
 * the only thing that delivers them, and `makeActorClient` refuses to bind a
 * `system` ctx to a request (§1.6). A GraphQL field for them would be a way to
 * forge one side of a friendship.
 */
import type {
  FriendEdgeDto,
  FriendRequestDto,
  FriendRequestRowDto,
  ItemRef,
  PlaceInteractionDto,
  RecordPlaceInteractionInput,
  ToggleFavoriteResult,
  UpdateProfileInput,
  UserProfileDto,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  FRIEND_REQUEST_DIRECTIONS,
  FriendsCollectionActorDescriptor,
  itemActorId,
  UserActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { FriendRequestStatusEnum } from "./enums.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch } from "./patch.ts";
import { Viewer } from "./viewer.ts";

/**
 * The viewer's own `UserActor`. Anonymous is a `Forbidden`, not an empty
 * result: "there is no such user" and "you are not signed in" are different
 * answers and the client acts on them differently.
 */
const myActor = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(UserActorDescriptor, viewerId);
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export const FriendRequestDirectionEnum = builder.enumType(
  "FriendRequestDirection",
  {
    description:
      "Relative to the viewer, not to the row: `friend_requests.user_id` is " +
      "always the requester, so one row is OUTGOING for them and INCOMING " +
      "for the recipient.",
    values: FRIEND_REQUEST_DIRECTIONS,
  },
);

/**
 * One batch, N parallel `UserActor.getProfile` calls (§1.5).
 *
 * C3's `FriendsCollectionActor` returns user *ids* — a friend list is a list of
 * people, and a person is an entity-actor read — so this is what turns a page
 * of them into profiles. `getProfile` is readable by any signed-in viewer and
 * returns `email: null` for anybody but the owner, so the fan-out cannot widen
 * what the list decided.
 *
 * **This is the fan-out worth watching.** Every other C3 DataLoader hits actors
 * that only that page's viewer contends for; `UserActor(friend)` is the *other*
 * person's actor, which also serializes their writes (friend requests,
 * favourites, place interactions). A page of 20 friends touches 20 actors that
 * belong to 20 other people. It is one batched round trip, not an N+1, but it
 * is the one place where rendering a list can queue behind somebody else's
 * mutation.
 */
const loadProfiles = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (UserProfileDto | Error)[]> =>
  await Promise.all(
    keys.map(async (key): Promise<UserProfileDto | Error> => {
      try {
        return await context.actor(UserActorDescriptor, key).getProfile();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

export const UserProfileType = builder
  .loadableObjectRef<UserProfileDto, string>("UserProfile", {
    load: loadProfiles,
    toKey: (profile) => profile.id,
  })
  .implement({
    description:
      "A user, as any signed-in viewer may see them. Profile fields live in " +
      "better-auth's `user` table; there is no `public.users` (plan §3).",
    fields: (t) => ({
      id: t.exposeID("id"),
      displayName: t.exposeString("displayName"),
      avatarUrl: t.exposeString("avatarUrl", { nullable: true }),
      locale: t.exposeString("locale", { nullable: true }),
      email: t.exposeString("email", {
        nullable: true,
        description:
          "Only ever populated for the owner (or an admin); null for " +
          "everybody else, including friends.",
      }),
    }),
  });

export const FriendType = builder.objectRef<FriendEdgeDto>("Friend").implement({
  description: "Someone the user is friends with, and since when.",
  fields: (t) => ({
    user: t.field({
      type: UserProfileType,
      description:
        "The *other* user — never the one whose list this is. Resolved " +
        "through the `UserProfile` DataLoader: `FriendsCollectionActor` " +
        "returns ids, and the loader batches them into parallel " +
        "`UserActor.getProfile` calls (§1.5).",
      resolve: (friend) => friend.userId,
    }),
    since: t.expose("since", { type: "DateTime" }),
  }),
});

export const FriendRequestType = builder
  .objectRef<FriendRequestRowDto>("FriendRequest")
  .implement({
    description: "A pending `friend_requests` row.",
    fields: (t) => ({
      id: t.exposeID("id"),
      requesterId: t.exposeID("requesterId"),
      recipientId: t.exposeID("recipientId"),
      status: t.field({
        type: FriendRequestStatusEnum,
        resolve: (row) => row.status,
      }),
      direction: t.field({
        type: FriendRequestDirectionEnum,
        resolve: (row) => row.direction,
      }),
      user: t.field({
        type: UserProfileType,
        description:
          "The person on the other end, from the viewer's side. An id, " +
          "batched through the `UserProfile` DataLoader (§1.5).",
        resolve: (row) => row.otherUserId,
      }),
    }),
  });

export const PlaceInteractionType = builder
  .objectRef<PlaceInteractionDto>("PlaceInteraction")
  .implement({
    description:
      "The viewer's own relationship with a place: saved, visited, rated.",
    fields: (t) => ({
      id: t.exposeID("id"),
      placeId: t.exposeID("placeId"),
      isFavorite: t.exposeBoolean("isFavorite"),
      isVisited: t.exposeBoolean("isVisited"),
      wantToVisit: t.exposeBoolean("wantToVisit"),
      rating: t.exposeInt("rating", { nullable: true }),
      notes: t.exposeString("notes", { nullable: true }),
      tags: t.exposeStringList("tags"),
      lastVisitedAt: t.expose("lastVisitedAt", {
        type: "DateTime",
        nullable: true,
      }),
      visitCount: t.exposeInt("visitCount", {
        description:
          "Computed by `UserActor` from the not-visited → visited " +
          "transition, never supplied by the client (plan §2.1).",
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

/**
 * Pre-built connection objects rather than `t.connection`, for the reason
 * `reference-data.ts` gives: `t.connection` mints a fresh
 * `<Parent><Field>Connection` per field for one structurally identical shape.
 */
export const FriendConnection = builder.connectionObject(
  { type: FriendType, name: "FriendConnection" },
  { name: "FriendEdge" },
);
export const FriendRequestConnection = builder.connectionObject(
  { type: FriendRequestType, name: "FriendRequestConnection" },
  { name: "FriendRequestEdge" },
);
export const PlaceInteractionConnection = builder.connectionObject(
  { type: PlaceInteractionType, name: "PlaceInteractionConnection" },
  { name: "PlaceInteractionEdge" },
);

/* -------------------------------------------------------------------------- */
/* Mutation payloads                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every mutation returns an object, never a bare `Boolean`: `plugin-errors`
 * builds a union of the payload and the five typed errors (§8.3), and a
 * GraphQL union member must be an object type.
 */
type AcceptPayload = { requestId: string; friendId: string; created: boolean };

const AcceptFriendRequestPayload = builder
  .objectRef<AcceptPayload>("AcceptFriendRequestPayload")
  .implement({
    description:
      "The recipient's half of the handshake. The requester's `friends` row " +
      "and the closing of the request follow through the outbox (§1.7), so a " +
      "client that re-reads immediately may briefly see one row, not two — " +
      "`isFriend` is true either way.",
    fields: (t) => ({
      requestId: t.exposeID("requestId"),
      friendId: t.exposeID("friendId", {
        description: "The requester, who is now a friend.",
      }),
      created: t.exposeBoolean("created", {
        description:
          "False when this call was a repeat: the row already existed.",
      }),
    }),
  });

type RejectPayload = { requestId: string; deleted: boolean };

const RejectFriendRequestPayload = builder
  .objectRef<RejectPayload>("RejectFriendRequestPayload")
  .implement({
    description: "Cancelling a request you sent, or declining one you got.",
    fields: (t) => ({
      requestId: t.exposeID("requestId"),
      deleted: t.exposeBoolean("deleted", {
        description:
          "True when the row was removed in this call — which happens only " +
          "when the viewer is the requester. A recipient's decline is handed " +
          "to the outbox and returns false.",
      }),
    }),
  });

type RemovePayload = { userId: string; removed: boolean };

const RemoveFriendPayload = builder
  .objectRef<RemovePayload>("RemoveFriendPayload")
  .implement({
    description:
      "The friendship is gone — both `friends` rows, in the transaction that " +
      "answered this. `removed` is false when there was nothing left to " +
      "remove, which a retry makes the normal answer.",
    fields: (t) => ({
      userId: t.exposeID("userId"),
      removed: t.exposeBoolean("removed"),
    }),
  });

const ToggleFavoritePayload = builder
  .objectRef<ToggleFavoriteResult>("ToggleFavoritePayload")
  .implement({
    description: "The state of one favourite after the toggle.",
    fields: (t) => ({
      favorited: t.exposeBoolean("favorited"),
      itemId: t.id({ resolve: (result) => result.ref.id }),
      itemType: t.field({
        type: ItemTypeEnum,
        resolve: (result) => result.ref.type,
      }),
      item: t.field({
        type: ItemInterface,
        description: "Resolved through the item DataLoader (§1.5).",
        resolve: (result) => itemActorId(result.ref),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

const UpdateProfileInputType = builder.inputType("UpdateProfileInput", {
  description:
    "Every field is optional; an omitted field is unchanged. `null` clears " +
    "`avatarUrl` or `locale`; `displayName: null` is a ValidationError. " +
    "`role`, `disabled` and `emailVerified` are deliberately absent (A6).",
  fields: (t) => ({
    displayName: t.string({ required: false }),
    avatarUrl: t.string({ required: false }),
    locale: t.string({ required: false }),
  }),
});

const RecordPlaceInteractionInputType = builder.inputType(
  "RecordPlaceInteractionInput",
  {
    description:
      "Note the absence of `visitCount`: it is computed server-side from the " +
      "visited transition (plan §2.1). Omitted fields keep their stored value; " +
      "`null` clears `rating`, `notes` or `tags` and is ignored for the flags.",
    fields: (t) => ({
      placeId: t.id({ required: true }),
      isFavorite: t.boolean({ required: false }),
      isVisited: t.boolean({ required: false }),
      wantToVisit: t.boolean({ required: false }),
      rating: t.int({ required: false }),
      notes: t.string({ required: false }),
      tags: t.stringList({ required: false }),
    }),
  },
);

/**
 * `displayName: null` used to reach the actor as `""` and fail its non-empty
 * check with a message about an empty string nobody sent; it is refused here,
 * by name. `avatarUrl` and `locale` are nullable in `UpdateProfileInput` and
 * in better-auth, so `null` clears them.
 */
const UPDATE_PROFILE = {
  displayName: "reject",
  avatarUrl: "clearable",
  locale: "clearable",
} satisfies PatchPolicy<typeof UpdateProfileInputType.$inferInput>;

/**
 * `placeId` is required, so it is not a patch field. The three flags are
 * NOT NULL booleans (`null` would mean nothing), while `rating`, `notes` and
 * `tags` are nullable and `UserActor.recordPlaceInteraction` clears them.
 */
const RECORD_PLACE_INTERACTION = {
  isFavorite: "keep",
  isVisited: "keep",
  wantToVisit: "keep",
  rating: "clearable",
  notes: "clearable",
  tags: "clearable",
} satisfies PatchPolicy<
  Omit<typeof RecordPlaceInteractionInputType.$inferInput, "placeId">
>;

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

builder.queryField("user", (t) =>
  t.field({
    type: UserProfileType,
    description:
      "One user's public profile. Any signed-in viewer may read it; `email` " +
      "comes back null unless the viewer is the owner.",
    args: { id: t.arg.id({ required: true }) },
    errors: {},
    resolve: (_root, args, context) =>
      context.actor(UserActorDescriptor, String(args.id)).getProfile(),
  }),
);

/** The viewer's own `FriendsCollectionActor`, or a `Forbidden`. */
const myFriendsCollection = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(
    FriendsCollectionActorDescriptor,
    viewerCollectionActorId(viewerId),
  );
};

builder.queryField("myFriends", (t) =>
  t.field({
    type: FriendConnection,
    description:
      "The viewer's friends (`/friends`). Served by C3's " +
      "`FriendsCollectionActor`, which returns the other user's **id** per " +
      "row; `Friend.user` batches those through the `UserProfile` " +
      "DataLoader (§1.5) instead of inlining a profile read per row.",
    args: t.arg.connectionArgs(),
    errors: {},
    resolve: async (_root, args, context) =>
      connectionFromPage(
        await myFriendsCollection(context, "see your friends").friends(
          toPageArgs(args),
        ),
      ),
  }),
);

builder.queryField("myFriendRequests", (t) =>
  t.field({
    type: FriendRequestConnection,
    description: "The viewer's incoming or outgoing friend requests.",
    args: {
      direction: t.arg({
        type: FriendRequestDirectionEnum,
        required: true,
      }),
      ...t.arg.connectionArgs(),
    },
    errors: {},
    resolve: async (_root, args, context) =>
      connectionFromPage(
        await myFriendsCollection(context, "see your friend requests").requests(
          args.direction,
          toPageArgs(args),
        ),
      ),
  }),
);

builder.queryField("myPlaceInteractions", (t) =>
  t.field({
    type: PlaceInteractionConnection,
    description: "Places the viewer has saved, visited or rated.",
    args: t.arg.connectionArgs(),
    errors: {},
    resolve: async (_root, args, context) =>
      connectionFromPage(
        await myActor(context, "see your places").placeInteractions(
          toPageArgs(args),
        ),
      ),
  }),
);

builder.queryField("myPlaceInteraction", (t) =>
  t.field({
    type: PlaceInteractionType,
    nullable: true,
    description: "The viewer's row for one place, or null if there is none.",
    args: { placeId: t.arg.id({ required: true }) },
    errors: {},
    resolve: (_root, args, context) =>
      myActor(context, "see your places").placeInteraction(
        String(args.placeId),
      ),
  }),
);

/**
 * `viewer.ts` left this field to B4 on purpose: A6's token carries a closed
 * claim set, so the display name and avatar are one actor call away rather
 * than in the JWT.
 */
builder.objectField(Viewer, "profile", (t) =>
  t.field({
    type: UserProfileType,
    description: "The viewer's own profile row, including their email.",
    resolve: (viewer, _args, context) =>
      context.actor(UserActorDescriptor, viewer.id).getProfile(),
  }),
);

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

builder.mutationField("updateProfile", (t) =>
  t.field({
    type: UserProfileType,
    description: "Change the viewer's own profile (proxied to better-auth).",
    args: {
      input: t.arg({ type: UpdateProfileInputType, required: true }),
    },
    errors: {},
    resolve: (_root, args, context) =>
      myActor(context, "update your profile").updateProfile(
        patch(args.input, UPDATE_PROFILE) satisfies UpdateProfileInput,
      ),
  }),
);

/**
 * `UserActor.sendFriendRequest` answers with B4's `FriendRequestDto`, which
 * inlines the other user's profile; `FriendRequest` now carries the *id* and
 * lets the `UserProfile` DataLoader batch it (§1.5). The profile is already in
 * hand here, so this drops it to the id rather than re-reading anything — the
 * loader will find it needed for exactly one row.
 */
const toRequestRow = (row: FriendRequestDto): FriendRequestRowDto => ({
  id: row.id,
  requesterId: row.requesterId,
  recipientId: row.recipientId,
  status: row.status,
  direction: row.direction,
  otherUserId: row.otherUser.id,
});

builder.mutationField("sendFriendRequest", (t) =>
  t.field({
    type: FriendRequestType,
    description:
      "Ask another user to be friends. Rejected for yourself (Validation), " +
      "an existing friend, or a request already open either way (Conflict). " +
      "All four carry an `ActorError.reason` — CANNOT_FRIEND_SELF, " +
      "ALREADY_FRIENDS, FRIEND_REQUEST_ALREADY_SENT or " +
      "FRIEND_REQUEST_ALREADY_RECEIVED — because the three Conflicts share one " +
      "`code`. Switch on `reason`; never match on `message`.",
    args: { userId: t.arg.id({ required: true }) },
    errors: {},
    resolve: async (_root, args, context) =>
      toRequestRow(
        await myActor(context, "send a friend request").sendFriendRequest(
          String(args.userId),
        ),
      ),
  }),
);

builder.mutationField("acceptFriendRequest", (t) =>
  t.field({
    type: AcceptFriendRequestPayload,
    description:
      "Accept a request addressed to you. Writes the viewer's own `friends` " +
      "row; the requester's row follows through the outbox (§1.7).",
    args: { requestId: t.arg.id({ required: true }) },
    errors: {},
    resolve: async (_root, args, context) => {
      const result = await myActor(
        context,
        "accept a friend request",
      ).acceptFriendRequest(String(args.requestId));
      // `outboxRowId` is deliberately not exposed: it is an internal delivery
      // handle, not something a client should learn or retry against.
      return {
        requestId: result.requestId,
        friendId: result.friendId,
        created: result.friendRowInserted,
      };
    },
  }),
);

builder.mutationField("rejectFriendRequest", (t) =>
  t.field({
    type: RejectFriendRequestPayload,
    description:
      "Decline a request sent to you, or cancel one you sent. Both are the " +
      "same row; only the requester's actor may delete it.",
    args: { requestId: t.arg.id({ required: true }) },
    errors: {},
    resolve: async (_root, args, context) => {
      const requestId = String(args.requestId);
      const deleted = await myActor(
        context,
        "reject a friend request",
      ).rejectFriendRequest(requestId);
      return { requestId, deleted };
    },
  }),
);

builder.mutationField("removeFriend", (t) =>
  t.field({
    type: RemoveFriendPayload,
    description:
      "Unfriend someone. **Both** `friends` rows are gone before this " +
      "answers, so the viewer's next read already shows the removal (E2d: " +
      "`myFriends` used to keep listing them for ~2s after this succeeded). " +
      "The outbox row that follows only reloads the other person's actor.",
    args: { userId: t.arg.id({ required: true }) },
    errors: {},
    resolve: async (_root, args, context) => {
      const userId = String(args.userId);
      const removed = await myActor(context, "remove a friend").removeFriend(
        userId,
      );
      return { userId, removed };
    },
  }),
);

builder.mutationField("toggleFavorite", (t) =>
  t.field({
    type: ToggleFavoritePayload,
    description: "Add or remove one item from the viewer's favourites.",
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
    },
    errors: {},
    resolve: (_root, args, context) => {
      const ref: ItemRef = { type: args.type, id: String(args.itemId) };
      return myActor(context, "change your favourites").toggleFavorite(ref);
    },
  }),
);

builder.mutationField("recordPlaceInteraction", (t) =>
  t.field({
    type: PlaceInteractionType,
    description:
      "Save, visit or rate a place. The visit count is recomputed by the " +
      "actor; there is no way to set it.",
    args: {
      input: t.arg({ type: RecordPlaceInteractionInputType, required: true }),
    },
    errors: {},
    resolve: (_root, args, context) => {
      const { placeId, ...fields } = args.input;
      const payload: RecordPlaceInteractionInput = {
        placeId: String(placeId),
        ...patch(fields, RECORD_PLACE_INTERACTION),
      };
      return myActor(
        context,
        "record a place interaction",
      ).recordPlaceInteraction(payload);
    },
  }),
);
