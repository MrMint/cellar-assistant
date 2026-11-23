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
import type { FriendProfileDto } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  FriendsCollectionActorDescriptor,
  MAX_PAGE_SIZE,
  UserActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { CellarConnection } from "./cellar.ts";
import { ItemCheckInConnection } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { TierListConnection } from "./tier-list.ts";
import { UserProfileType } from "./user.ts";
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
