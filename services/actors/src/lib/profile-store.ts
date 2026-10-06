/**
 * Where a user's profile fields actually live (B4; A6's `src/auth/README.md`).
 *
 * > Loads: … Profile fields live in better-auth's `user` table (§3, exempt).
 *
 * There is no `public.users` table and there never was one — Nhost kept
 * identity in `auth.users`, and A6 moved it to better-auth's `user`. §3 exempts
 * better-auth's five tables from the single-writer map because better-auth's
 * own Drizzle adapter writes them (`packages/db/src/writers.ts`,
 * `infrastructure:better-auth`), which is why an actor still may not reach them
 * through `this.db`.
 *
 * **What X2 changed.** The two other reasons this seam existed are gone: `user`
 * is no longer in a different database (`AUTH_DATABASE_URL` and `DATABASE_URL`
 * name the same one), and it is no longer absent from `@cellar-assistant/db`.
 * So this module is now a *rule* rather than a physical necessity — the one
 * place in `services/actors` outside `auth/` that the single-writer containment
 * check lets touch better-auth's tables, holding the surface down to three
 * columns. It reads through `actorDb()`, the process's one pool.
 *
 * The practical consequence for callers is that `UserActor`'s `missingProfile`
 * fallback no longer covers a real case: existence and profile are one row now,
 * so an id that exists cannot be missing a profile. It is kept as a defence
 * against a `friends` row whose user was hard-deleted out from under it.
 *
 * ## Why not better-auth's HTTP API
 *
 * §2.1 says `updateProfile` "proxies to better-auth's API". `auth.api.updateUser`
 * is session-shaped: it wants the caller's cookie or bearer token, which an
 * actor turn does not have — the actor was reached through the sidecar, with a
 * `Ctx`, long after the JWT was verified in `services/api`. Re-minting a session to
 * call one's own process over HTTP would also put a network round trip inside a
 * `UserActor` turn, which §2.1 forbids outright ("No AI or external call runs
 * inside a `UserActor` turn"). So the proxy is at the storage layer: the same
 * columns better-auth's adapter writes.
 *
 * `role`, `disabled` and `emailVerified` are deliberately **not** writable
 * here. A6 declares them `input: false` precisely so a user cannot set them,
 * and routing around that through a side door would undo it.
 */
// X2: these come from `@cellar-assistant/db/orm` like every other module's
// (§8.3). They used to come straight from `drizzle-orm` because the `user`
// table was built by *this* app's copy of drizzle-orm inside better-auth's
// island, and mixing a table from one copy with an operator from the other is a
// screen-long structural type error. The table now lives in `packages/db` with
// everything else, so the exception is retired along with the second database.
import { user } from "@cellar-assistant/db";
import { and, eq, inArray, notInArray, sql } from "@cellar-assistant/db/orm";
import { actorDb } from "./db.ts";

/** The columns `UserProfileDto` is built from. */
export type ProfileFields = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly locale: string | null;
  readonly email: string | null;
};

/** Only what `updateProfile` may change. */
export type ProfilePatch = {
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly locale?: string | null;
};

/** What `UserSearchActor` (C1) asks the store for. */
export type ProfileSearch = {
  /** Matched as `%term%` on the display name, case-insensitively. */
  readonly term: string;
  /** Never returned: the viewer, their friends, and anyone mid-request. */
  readonly excludeIds: readonly string[];
  readonly limit: number;
};

export type ProfileStore = {
  /**
   * Batched on purpose: a page of friends is one round trip, not one per row.
   * Ids with no row are simply absent from the map.
   */
  load(userIds: readonly string[]): Promise<Map<string, ProfileFields>>;
  /** Returns the row after the update, or `null` if the user does not exist. */
  update(userId: string, patch: ProfilePatch): Promise<ProfileFields | null>;
  /**
   * C1's `UserSearchActor`. The exclusion set is computed by the caller from
   * `friends` and `friend_requests` and passed in. That used to be forced —
   * those tables were in a different database from this one, so the join
   * `SearchUsersQuery` expresses as four nested `_not`s could not be written as
   * SQL at all. Since X2 it *could* be, and is deliberately still not: this
   * module is the whole of `services/actors`' contact with better-auth's tables
   * outside `auth/`, and a search that reached back into two aggregates it does
   * not own would be a worse trade than one extra query. Excluding before the
   * `LIMIT` (rather than filtering the page afterwards) is what keeps a viewer
   * with many friends from getting a short page or an empty one.
   */
  search(input: ProfileSearch): Promise<readonly ProfileFields[]>;
};

const toFields = (row: {
  id: string;
  name: string;
  image: string | null;
  locale: string | null;
  email: string;
}): ProfileFields => ({
  id: row.id,
  // better-auth calls it `name`; every screen in this app calls it a display
  // name, and `migrate-users.ts` copies `auth.users.display_name` into it.
  displayName: row.name,
  // `""` is Nhost's default for `avatar_url`, and it survived the migration.
  // An empty string is not a URL, so it reaches GraphQL as null.
  avatarUrl: row.image === null || row.image === "" ? null : row.image,
  locale: row.locale,
  email: row.email,
});

const SELECTION = {
  id: user.id,
  name: user.name,
  image: user.image,
  locale: user.locale,
  email: user.email,
} as const;

/** The production store. Reads and writes better-auth's own `user` table. */
export const betterAuthProfileStore = (): ProfileStore => ({
  load: async (userIds) => {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await actorDb()
      .select(SELECTION)
      .from(user)
      .where(inArray(user.id, ids));
    return new Map(rows.map((row) => [row.id, toFields(row)]));
  },

  search: async ({ term, excludeIds, limit }) => {
    const pattern = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const rows = await actorDb()
      .select(SELECTION)
      .from(user)
      .where(
        and(
          sql`${user.name} ilike ${pattern} escape '\\'`,
          eq(user.disabled, false),
          excludeIds.length === 0
            ? sql`true`
            : notInArray(user.id, [...new Set(excludeIds)]),
        ),
      )
      // A total order, so an offset cursor over the held result set is stable:
      // exact match, then shortest, then alphabetical, then id.
      .orderBy(
        sql`(lower(${user.name}) = ${term.toLowerCase()}) desc`,
        sql`length(${user.name}) asc`,
        sql`lower(${user.name}) asc`,
        user.id,
      )
      .limit(limit);
    return rows.map(toFields);
  },

  update: async (userId, patch) => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.displayName !== undefined) set.name = patch.displayName;
    if (patch.avatarUrl !== undefined) set.image = patch.avatarUrl;
    if (patch.locale !== undefined) set.locale = patch.locale;

    const rows = await actorDb()
      .update(user)
      .set(set)
      .where(eq(user.id, userId))
      .returning(SELECTION);
    const row = rows[0];
    return row === undefined ? null : toFields(row);
  },
});

/**
 * Kept as a no-op for callers that still close the store on shutdown.
 *
 * There is nothing left to close: X2 replaced this module's second `pg.Pool`
 * with `actorDb()`, so the pool it used to own is the process's one pool and
 * `closeActorDb()` ends it.
 */
export const closeProfileStore = (): Promise<void> => Promise.resolve();
