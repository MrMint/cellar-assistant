/**
 * X18 — the Me hub's counts and a friend's read-only profile.
 *
 * Like every module here this decides nothing: `Viewer.counts` is one call
 * to the viewer's own `UserActor`, and every `FriendProfile` field is one
 * `FriendsCollectionActor(viewer)` call, which holds the friendship gate and
 * re-checks it on each turn. A section of a profile therefore cannot be
 * reached for someone who is not a friend, even by a client that skips the
 * root field.
 *
 * ## No existence oracle
 *
 * `friendProfile` answers a stranger, the viewer, an id that names nobody and
 * a malformed id with the same `NotFoundError` and the same message
 * (`PROFILE_NOT_SHARED`, D24). It does not read the profile first: a profile
 * read would answer "this account exists" before the gate said no.
 */
import type {
  ActivityEntryDto,
  FriendEdgeDto,
  FriendProfileDto,
  MutualFriendsDto,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  FriendsCollectionActorDescriptor,
  LATEST_ACTIVITY_MAX_IDS,
  MAX_PAGE_SIZE,
  UserActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { CellarConnection } from "./cellar.ts";
import { ActivityEntryType } from "./discovery.ts";
import { ItemCheckInConnection } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { TierListConnection } from "./tier-list.ts";
import { FriendType, UserProfileType } from "./user.ts";
import { Viewer } from "./viewer.ts";

/** The viewer's own `FriendsCollectionActor`, or a `Forbidden`. */
const friendsOf = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(
    FriendsCollectionActorDescriptor,
    viewerCollectionActorId(viewerId),
  );
};

/**
 * A profile section's page, `first` clamped to the server cap (leftovers 6).
 *
 * Everywhere else an over-cap `first` is a `VALIDATION` error (A7g). Here the
 * three sections sit under one `friendProfile` union member, so one section's
 * error would null the whole profile, not just its own list: a "Show more"
 * asking for too much would blank the page it was extending. Clamping keeps
 * the cap (the actor never reads more than {@link MAX_PAGE_SIZE} rows) without
 * that failure. `after` passes through untouched.
 */
const sectionPage = (args: { first?: number | null; after?: string | null }) =>
  toPageArgs({
    ...args,
    first:
      args.first === undefined || args.first === null
        ? args.first
        : Math.min(args.first, MAX_PAGE_SIZE),
  });

/* -------------------------------------------------------------------------- */
/* Viewer.counts                                                               */
/* -------------------------------------------------------------------------- */

type ViewerCountsShape = {
  bottles: number;
  logs: number;
  places: number;
  tierLists: number;
};

const ViewerCountsType = builder
  .objectRef<ViewerCountsShape>("ViewerCounts")
  .implement({
    description:
      "The Me hub's counts (X18). Each is the viewer's own: a friend's " +
      "cellar or list never adds to them.",
    fields: (t) => ({
      bottles: t.exposeInt("bottles", {
        description:
          "Bottles still in a cellar you created or co-own — the D13 count " +
          "every cellar card shows.",
      }),
      logs: t.exposeInt("logs", {
        description:
          "Drink-log entries about you, with or without a bottle (X02).",
      }),
      places: t.exposeInt("places", {
        description:
          "Distinct places you have been: marked visited, or named on one of " +
          "your logs.",
      }),
      tierLists: t.exposeInt("tierLists", {
        description: "Tier lists you made, whatever their privacy.",
      }),
    }),
  });

builder.objectField(Viewer, "counts", (t) =>
  t.field({
    type: ViewerCountsType,
    description: "The Me hub's counts (X18).",
    resolve: (viewer, _args, context) =>
      context.actor(UserActorDescriptor, viewer.id).counts(),
  }),
);

/* -------------------------------------------------------------------------- */
/* FriendProfile                                                               */
/* -------------------------------------------------------------------------- */

const FriendProfileType = builder
  .objectRef<FriendProfileDto>("FriendProfile")
  .implement({
    description:
      "A friend, as their read-only profile shows them (X18): their tier " +
      "lists and cellars you may open, and their drink log. Only ever " +
      "returned for a friend.",
    fields: (t) => ({
      id: t.id({
        description: "The friend's user id — the profile's identity.",
        resolve: (profile) => profile.userId,
      }),
      user: t.field({
        type: UserProfileType,
        resolve: (profile) => profile.userId,
      }),
      since: t.expose("since", {
        type: "DateTime",
        description: "When the friendship began.",
      }),
      tierLists: t.field({
        type: TierListConnection,
        description:
          "Their tier lists you may see — PUBLIC and FRIENDS, never PRIVATE " +
          "(`canSeeTierList`) — most recently changed first.",
        args: t.arg.connectionArgs(),
        resolve: async (profile, args, context) =>
          connectionFromPage(
            await friendsOf(context, "see a profile").profileTierLists(
              { profileOf: profile.userId },
              sectionPage(args),
            ),
          ),
      }),
      cellars: t.field({
        type: CellarConnection,
        description:
          "Cellars they created or co-own that you may open " +
          "(`canSeeCellar`), newest first.",
        args: t.arg.connectionArgs(),
        resolve: async (profile, args, context) =>
          connectionFromPage(
            await friendsOf(context, "see a profile").profileCellars(
              { profileOf: profile.userId },
              sectionPage(args),
            ),
          ),
      }),
      checkIns: t.field({
        type: ItemCheckInConnection,
        description:
          "Their drink log — entries about them, newest first, as " +
          "`canSeeCheckIn` admits them.",
        args: t.arg.connectionArgs(),
        resolve: async (profile, args, context) =>
          connectionFromPage(
            await friendsOf(context, "see a profile").profileLogs(
              { profileOf: profile.userId },
              sectionPage(args),
            ),
          ),
      }),
    }),
  });

builder.queryField("friendProfile", (t) =>
  t.field({
    type: FriendProfileType,
    description:
      "A friend's read-only profile (X18). `NotFoundError` — one message for " +
      "every case — for anyone who is not your friend, yourself included, and " +
      "for an id that names nobody: the answer never says whether an account " +
      "exists.",
    args: { userId: t.arg.id({ required: true }) },
    errors: {},
    resolve: (_root, args, context) =>
      friendsOf(context, "see a profile").profile(String(args.userId)),
  }),
);

/* -------------------------------------------------------------------------- */
/* Friend.latestActivity — F-51                                                */
/* -------------------------------------------------------------------------- */

builder.objectField(FriendType, "latestActivity", (t) =>
  t.loadable({
    type: ActivityEntryType,
    nullable: true,
    description:
      "F-51: this friend's newest activity you may see — a ranking, a log, " +
      "a review or a bottle, each by its own rule (a PRIVATE list's entry " +
      "never counts) — or null with none. One batched " +
      "`FriendsCollectionActor.latestActivity` call per page of friends.",
    resolve: (friend: FriendEdgeDto) => friend.userId,
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(ActivityEntryDto | null)[]> => {
      const collection = friendsOf(context, "see your friends");
      const out: (ActivityEntryDto | null)[] = [];
      for (let at = 0; at < keys.length; at += LATEST_ACTIVITY_MAX_IDS) {
        const chunk = keys.slice(at, at + LATEST_ACTIVITY_MAX_IDS);
        out.push(...(await collection.latestActivity({ latestOf: chunk })));
      }
      return out;
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* mutualFriends — F-94                                                        */
/* -------------------------------------------------------------------------- */

const MutualFriendsType = builder
  .objectRef<MutualFriendsDto>("MutualFriends")
  .implement({
    description:
      "F-94: your friends who are also someone's friends — the locked " +
      'profile\'s "Friend of …". Only ever people already on your own list.',
    fields: (t) => ({
      count: t.exposeInt("count"),
      first: t.field({
        type: UserProfileType,
        nullable: true,
        description: "The first of them by name; null with none.",
        resolve: (mutual) => mutual.firstUserId,
      }),
    }),
  });

builder.queryField("mutualFriends", (t) =>
  t.field({
    type: MutualFriendsType,
    description:
      "F-94: how many of your friends are `userId`'s friends, and the first " +
      "by name. Answered for any profile you may see, friend or not; " +
      "yourself, an id that names nobody and a malformed id all answer a " +
      "count of 0, so it never says whether an account exists.",
    args: { userId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      friendsOf(context, "see mutual friends").mutualFriends({
        mutualWith: String(args.userId),
      }),
  }),
);
