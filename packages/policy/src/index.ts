/**
 * Visibility rules (migration plan §1.6).
 *
 * Imported by `services/actors` only. Resolvers never decide visibility; actors call
 * these with the `Ctx` the resolver passed through (§8.2).
 *
 * ## Every function here is pure
 *
 * Nothing in this package opens a database connection, and nothing takes a
 * Drizzle handle. An actor has already loaded its aggregate on activate (§1.1),
 * so it *has* the privacy flag, the owner ids and its friend rows in memory —
 * it passes those in. That is what makes owner/friend/stranger tests three
 * plain function calls rather than three database fixtures, and it is why a
 * policy decision can never issue a surprise query inside an actor turn.
 *
 * ## The four-branch rule
 *
 * The rule the RLS spike settled on, for every row carrying a `permission_type`
 * (`cellars`, `tier_lists`):
 *
 *   1. the viewer owns it — creator, or a co-owner row;  → visible
 *   2. `privacy = 'PUBLIC'`;                             → visible
 *   3. `privacy = 'FRIENDS'` and the viewer is a friend
 *      of the creator;                                   → visible
 *   4. otherwise — a stranger.                           → hidden
 *
 * `canSee` is that rule, once. `canSeeCellar` and `canSeeTierList` are adapters
 * from each aggregate's row shape onto it; do not re-implement the branches.
 *
 * A `system` or `admin` ctx short-circuits ahead of all four (§1.6): `system` is
 * constructed only by `OutboxActor` and job actors and is not derivable from a
 * request.
 */
import type { Ctx } from "@cellar-assistant/contracts/ctx";
import { isAdmin, isSystem } from "@cellar-assistant/contracts/ctx";

/** `public.permission_type`. */
export const PRIVACY_VALUES = ["PUBLIC", "FRIENDS", "PRIVATE"] as const;
export type Privacy = (typeof PRIVACY_VALUES)[number];

/**
 * `system` bypasses every rule; it is constructed only by `OutboxActor` and job
 * actors. `admin` sees everything a user can see.
 */
export const bypassesPolicy = (ctx: Ctx): boolean =>
  isSystem(ctx) || isAdmin(ctx);

/**
 * Owner check — `menu_scans`, `item_onboardings`, `user_place_interactions`,
 * `item_favorites`, and any other row whose only rule is "mine".
 *
 * Takes the owner's id rather than a row, because the column is `user_id` on
 * four of those tables and `created_by_id` on the two privacy-bearing ones.
 * Pass `row.userId` or `row.createdById`; there is nothing to adapt.
 */
export const isOwner = (
  ctx: Ctx,
  ownerId: string | null | undefined,
): boolean => {
  if (bypassesPolicy(ctx)) return true;
  if (ctx.viewerId === null) return false;
  return ownerId === ctx.viewerId;
};

/* -------------------------------------------------------------------------- */
/* Friendship                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One `public.friends` row. The table is directed and §1.7 writes both
 * directions — the recipient's `UserActor` inserts one row and the outbox
 * delivers `confirmFriendship` to the requester's actor, which inserts the
 * other. `isFriend` still matches either direction, so a half-delivered
 * acceptance is never read as "not friends".
 */
export type Friendship = { userId: string; friendId: string };

/**
 * Whether `ctx.viewerId` and `otherUserId` are friends, given the friend rows
 * the calling actor already has in memory.
 *
 * A `system`/`admin` ctx does **not** short-circuit here: this answers a
 * question of fact about two users, not a question of permission. `canSee*` is
 * where the bypass belongs.
 */
export const isFriend = (
  ctx: Ctx,
  otherUserId: string | null | undefined,
  friendships: readonly Friendship[],
): boolean => {
  const viewer = ctx.viewerId;
  if (viewer === null || otherUserId === null || otherUserId === undefined) {
    return false;
  }
  if (viewer === otherUserId) return false;
  return friendships.some(
    (f) =>
      (f.userId === viewer && f.friendId === otherUserId) ||
      (f.userId === otherUserId && f.friendId === viewer),
  );
};

/* -------------------------------------------------------------------------- */
/* The four-branch rule                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Everything the four-branch rule needs, all of it already loaded by the actor.
 *
 * No field is optional. A forgotten `viewerIsFriendOfCreator` would silently
 * deny — safe, but wrong and invisible — so the compiler asks for it.
 */
export type VisibilitySubject = {
  readonly privacy: Privacy;
  /**
   * Everyone who counts as an owner: the creator, plus any co-owner rows.
   * `[cellar.createdById, ...cellarOwners.map(o => o.userId)]` for a cellar;
   * `[tierList.createdById]` for a tier list.
   */
  readonly ownerIds: readonly (string | null)[];
  /** Whether the viewer is a friend of the creator. Compute it with `isFriend`. */
  readonly viewerIsFriendOfCreator: boolean;
};

export const canSee = (ctx: Ctx, subject: VisibilitySubject): boolean => {
  if (bypassesPolicy(ctx)) return true;
  const viewer = ctx.viewerId;

  // 1. owner (creator or co-owner) — regardless of privacy
  if (viewer !== null && subject.ownerIds.includes(viewer)) return true;
  // 2. public
  if (subject.privacy === "PUBLIC") return true;
  // 3. friends-only, and the viewer is a friend of the creator
  if (
    subject.privacy === "FRIENDS" &&
    viewer !== null &&
    subject.viewerIsFriendOfCreator
  ) {
    return true;
  }
  // 4. stranger
  return false;
};

/* -------------------------------------------------------------------------- */
/* Aggregate adapters                                                          */
/* -------------------------------------------------------------------------- */

/** `cellars` + its `cellar_owners`, as `CellarActor` holds them (§2.1). */
export type CellarVisibility = {
  readonly createdById: string | null;
  readonly privacy: Privacy;
  /** `cellar_owners.user_id` for this cellar. */
  readonly coOwnerIds: readonly string[];
  readonly viewerIsFriendOfCreator: boolean;
};

export const canSeeCellar = (ctx: Ctx, cellar: CellarVisibility): boolean =>
  canSee(ctx, {
    privacy: cellar.privacy,
    ownerIds: [cellar.createdById, ...cellar.coOwnerIds],
    viewerIsFriendOfCreator: cellar.viewerIsFriendOfCreator,
  });

/** `tier_lists` (§2.1). No co-owner table exists for tier lists. */
export type TierListVisibility = {
  readonly createdById: string | null;
  readonly privacy: Privacy;
  readonly viewerIsFriendOfCreator: boolean;
};

export const canSeeTierList = (
  ctx: Ctx,
  tierList: TierListVisibility,
): boolean =>
  canSee(ctx, {
    privacy: tierList.privacy,
    ownerIds: [tierList.createdById],
    viewerIsFriendOfCreator: tierList.viewerIsFriendOfCreator,
  });

/**
 * A `check_ins` row.
 *
 * `check_ins` has no privacy column of its own: it points at a `cellar_items`
 * row, which belongs to a cellar. Two surfaces read it and they want different
 * things (§2.1 `CellarActor.checkIns`, §2.2 `CheckInsCollectionActor`), so both
 * are allowed here:
 *
 *   - the cellar is visible to the viewer — the cellar's check-in history; or
 *   - the viewer wrote the check-in, or is a friend of whoever did — the item
 *     detail page's "mine + friends'" history, which shows *that* a friend
 *     drank something without naming the cellar it came from.
 *
 * `bulkCheckIn` writes rows on behalf of friends, so `userId` is the person the
 * check-in is *about*, which is not necessarily who created it.
 */
export type CheckInVisibility = {
  /** `check_ins.user_id`. */
  readonly userId: string | null;
  /** The cellar holding `check_ins.cellar_item_id`. */
  readonly cellar: CellarVisibility;
  /** Whether the viewer is a friend of `userId`. Compute it with `isFriend`. */
  readonly viewerIsFriendOfCheckInUser: boolean;
};

export const canSeeCheckIn = (
  ctx: Ctx,
  checkIn: CheckInVisibility,
): boolean => {
  if (bypassesPolicy(ctx)) return true;
  if (isOwner(ctx, checkIn.userId)) return true;
  if (ctx.viewerId !== null && checkIn.viewerIsFriendOfCheckInUser) return true;
  return canSeeCellar(ctx, checkIn.cellar);
};

/**
 * An `item_image` row: `is_public`, or the viewer uploaded it (§2.1
 * `ItemActor`). The item itself is public; only its images are gated.
 */
export type ItemImageVisibility = {
  /** `item_image.user_id` — who uploaded it. */
  readonly userId: string | null;
  /** `item_image.is_public`. */
  readonly isPublic: boolean;
};

export const canSeeItemImage = (
  ctx: Ctx,
  image: ItemImageVisibility,
): boolean => {
  if (image.isPublic) return true;
  return isOwner(ctx, image.userId);
};
