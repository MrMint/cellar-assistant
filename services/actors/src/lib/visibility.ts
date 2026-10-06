/**
 * The inputs `packages/policy`'s visibility rules need, read from Postgres once
 * each.
 *
 * `packages/policy` is pure: `canSeeCellar` and `canSeeTierList` take the
 * privacy flag, the owner ids and "is the viewer a friend of the creator" as
 * arguments and never touch a database. Something has to read those, and it
 * used to be done by hand in each actor that needed them — the friendship read
 * three times (`CellarActor`, `TierListActor`, the search actors), a cellar's
 * visibility inputs three times (`CellarActor`, `CellarItemSearchActor`,
 * `ItemOnboardingActor`). A difference between those copies is a difference in
 * who can see a cellar depending on which door they came in by, so they live
 * here once.
 *
 * The SQL half — the same rules as a `where` clause, for collections that list
 * many rows in one query — is `./visibility-sql.ts`.
 *
 * ## Reads of tables the caller does not own are allowed
 *
 * `friends` is `UserActor`'s and `cellars`/`cellar_owners` are `CellarActor`'s,
 * and every function here reads them from other actors. §1.1's table ownership
 * governs **writes** (`packages/db/src/writers.ts`); a read adds no call-graph
 * edge, and §8.5 would forbid the synchronous `→ UserActor` / `→ CellarActor`
 * call that is the alternative. Nothing here writes.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { cellarOwners, cellars, friends } from "@cellar-assistant/db";
import { eq, or } from "@cellar-assistant/db/orm";
import type {
  CellarVisibility,
  Friendship,
  Privacy,
  TierListVisibility,
} from "@cellar-assistant/policy";
import { bypassesPolicy, isFriend } from "@cellar-assistant/policy";
import type { DbOrTx } from "./db.ts";

/**
 * `friends` rows touching `viewerId`, in **either** direction.
 *
 * B4's outcome note is load-bearing here: writing a friendship is one-sided,
 * but reading matches either direction, because between the two calls of an
 * acceptance only one row exists. A one-directional read would flicker "not
 * friends" for the width of the outbox window — and in a *search* that means
 * silently omitting rows.
 *
 * Read per turn, never cached on activate: friendship changes while an
 * activation is warm, and a cellar that stayed invisible for ten minutes after
 * a friend request was accepted would be a bug nobody could reproduce.
 */
export const friendshipsOf = async (
  db: DbOrTx,
  viewerId: string,
): Promise<readonly Friendship[]> =>
  db
    .select({ userId: friends.userId, friendId: friends.friendId })
    .from(friends)
    .where(or(eq(friends.userId, viewerId), eq(friends.friendId, viewerId)));

/**
 * The friendships a visibility decision for `ctx` needs: none for an anonymous
 * caller (who has no friends) or a privileged one (whom `canSee` admits before
 * asking), the viewer's otherwise.
 *
 * `isFriend` deliberately does not short-circuit for admin or system (§1.6) —
 * it answers a question of fact — so skipping the read is safe only because
 * `canSee*` never reaches the friendship branch for them.
 */
export const policyFriendships = async (
  db: DbOrTx,
  ctx: Ctx,
): Promise<readonly Friendship[]> => {
  const viewer = ctx.viewerId;
  return viewer === null || bypassesPolicy(ctx)
    ? []
    : await friendshipsOf(db, viewer);
};

/* -------------------------------------------------------------------------- */
/* Cellars                                                                     */
/* -------------------------------------------------------------------------- */

/** What decides who may see, and who may write to, one cellar. */
export type CellarAccess = {
  readonly createdById: string | null;
  readonly privacy: Privacy;
  /** `cellar_owners.user_id` for this cellar. */
  readonly coOwnerIds: readonly string[];
};

/**
 * `cellars` + `cellar_owners` for `cellarId`, or `null` when there is no such
 * cellar. For actors other than `CellarActor`, which has the same fields in its
 * aggregate already.
 */
export const loadCellarAccess = async (
  db: DbOrTx,
  cellarId: string,
): Promise<CellarAccess | null> => {
  const [cellar] = await db
    .select({ createdById: cellars.createdById, privacy: cellars.privacy })
    .from(cellars)
    .where(eq(cellars.id, cellarId));
  if (cellar === undefined) return null;
  const owners = await db
    .select({ userId: cellarOwners.userId })
    .from(cellarOwners)
    .where(eq(cellarOwners.cellarId, cellarId));
  return { ...cellar, coOwnerIds: owners.map((row) => row.userId) };
};

/** Creator or co-owner — `ownerId` may write to this cellar. No bypass. */
export const isCellarOwner = (
  access: CellarAccess,
  ownerId: string | null,
): boolean =>
  ownerId !== null &&
  (access.createdById === ownerId || access.coOwnerIds.includes(ownerId));

/** `canSeeCellar`'s argument, for `ctx`. */
export const cellarVisibility = async (
  db: DbOrTx,
  ctx: Ctx,
  access: CellarAccess,
): Promise<CellarVisibility> => ({
  createdById: access.createdById,
  privacy: access.privacy,
  coOwnerIds: access.coOwnerIds,
  viewerIsFriendOfCreator: isFriend(
    ctx,
    access.createdById,
    await policyFriendships(db, ctx),
  ),
});

/* -------------------------------------------------------------------------- */
/* Tier lists                                                                  */
/* -------------------------------------------------------------------------- */

/** What decides who may see one tier list. No co-owner concept exists. */
export type TierListAccess = {
  readonly createdById: string | null;
  readonly privacy: Privacy;
};

/** `canSeeTierList`'s argument, for `ctx`. */
export const tierListVisibility = async (
  db: DbOrTx,
  ctx: Ctx,
  access: TierListAccess,
): Promise<TierListVisibility> => ({
  createdById: access.createdById,
  privacy: access.privacy,
  viewerIsFriendOfCreator: isFriend(
    ctx,
    access.createdById,
    await policyFriendships(db, ctx),
  ),
});
