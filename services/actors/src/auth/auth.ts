/**
 * better-auth for the new stack (plan A6).
 *
 * Runs inside `services/actors` — the only process with database credentials —
 * mounted on the actor host's HTTP server at `/api/auth/*` (see `./mount.ts`).
 * `services/api` never talks to it per request: it verifies the `jwt` plugin's
 * 15-minute tokens against `/api/auth/jwks`.
 */
import { randomUUID } from "node:crypto";
import {
  account as accountTable,
  authSchema,
  user as userTable,
} from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import type { Pool } from "pg";
import { CLIENT_IP_HEADER, isVerifiedProxy } from "./client-ip.ts";
import type { AuthConfig } from "./config.ts";
import { type AuthDb, makeAuthDb } from "./db.ts";
import {
  displayNameForNewUser,
  displayNameUpdateRefusal,
} from "./display-name.ts";
import { JWKS_PLUGIN_OPTIONS, TOKEN_TTL_SECONDS } from "./jwks-rotation.ts";
import { createPassword } from "./password.ts";
import { SESSION_EXCHANGE_PATHS } from "./session-exchange-limit.ts";

/**
 * The only two roles a token may assert.
 *
 * `ctx.kind === 'system'` (plan §8.2) is constructed **only** by `OutboxActor`
 * and job actors. It has no representation here on purpose: whatever string a
 * `user.role` column ends up holding, the `role` claim collapses to exactly
 * `'admin'` or `'user'`, so no request can ever present a token that names the
 * system context. `role` is also declared `input: false` below, so a client
 * cannot write the column in the first place.
 */
const tokenRole = (role: unknown): "admin" | "user" =>
  role === "admin" ? "admin" : "user";

/** `user.disabled`, read off a user object better-auth hands a hook. */
const isDisabled = (user: unknown): boolean =>
  typeof user === "object" &&
  user !== null &&
  (user as { disabled?: unknown }).disabled === true;

/**
 * F8: no JWT for a disabled user, by either door that mints one.
 *
 * `definePayload` runs for `GET /api/auth/token` **and** for the jwt plugin's
 * `/get-session` after-hook, which signs a token into `set-auth-jwt` for every
 * session it sees. Both hand it the session's own user row, so this costs no
 * query. A disabled user's session used to keep minting 15-minute tokens for
 * the rest of its 7 days, and `services/api` never looks at `disabled` — the
 * token is the whole credential there.
 *
 * 401, not 403: to `services/client` (`token.ts`) either is "no session", and
 * 401 is what the same request gets once the session row is gone.
 */
const refuseDisabled = (user: unknown): void => {
  if (isDisabled(user)) {
    throw new APIError("UNAUTHORIZED", { message: "account disabled" });
  }
};

export type AuthInstance = ReturnType<typeof createAuth>["auth"];

/**
 * `shared` is the actor host's own Drizzle handle (X2). Passing it makes
 * better-auth use the one pool this process already has, against the one
 * database that now holds both its tables and the domain tables. Omitting it —
 * which only the tests do — opens a handle on `config.databaseUrl` instead.
 */
export const createAuth = (config: AuthConfig, shared?: AuthDb) => {
  const { pool, db } =
    shared === undefined
      ? makeAuthDb(config.databaseUrl)
      : { pool: shared.$client as Pool, db: shared };

  /**
   * Best-effort bcrypt→scrypt upgrade, keyed on the bcrypt hash itself — which
   * is unique per row because bcrypt salts, so no user id is needed and no
   * other row can be hit. See `./password.ts` for why a failure here cannot
   * lock anyone out.
   */
  const rehash = config.rehashOnSignIn
    ? async ({
        bcryptHash,
        newHash,
      }: {
        bcryptHash: string;
        newHash: string;
      }): Promise<void> => {
        await db
          .update(accountTable)
          .set({ password: newHash, updatedAt: new Date() })
          .where(eq(accountTable.password, bcryptHash));
      }
    : undefined;

  /**
   * Only providers with *both* halves of their credentials present are
   * registered, so a missing secret disables the provider instead of
   * half-configuring it. Redirect URIs to register with each provider are
   * `<BETTER_AUTH_URL>/api/auth/callback/<id>` — listed in
   * `infra/.env.example`.
   */
  const socialProviders = {
    ...(config.google ? { google: config.google } : {}),
    ...(config.facebook ? { facebook: config.facebook } : {}),
    ...(config.discord ? { discord: config.discord } : {}),
  };

  const auth = betterAuth({
    appName: "cellar-assistant",
    baseURL: config.baseUrl,
    // basePath defaults to /api/auth, which is what A7 and D1 expect.
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,

    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
      // The adapter addresses columns by JS property name. `tables.ts` is
      // `drizzle-kit pull` output and derives camelCase names from the
      // snake_case columns, which is exactly what better-auth expects;
      // `./auth-schema.test.ts` asserts that against `getAuthTables()` rather
      // than trusting it.
      camelCase: true,
    }),

    advanced: {
      database: {
        // The id columns are `uuid` (`packages/db/src/schema/tables.ts`),
        // matching the `auth.users.id` that 31 `public.*` foreign keys used to
        // point at — which is what let X2 repoint them at `"user"(id)` with no
        // cast (`packages/db/transform/14_repoint_user_fks.sql`). Migrated rows
        // keep their Nhost UUID; new rows get a fresh one.
        //
        // A function, not the built-in `"uuid"`: on Postgres that setting makes
        // the adapter omit the id column and rely on a database
        // `DEFAULT gen_random_uuid()`, which these tables deliberately do not
        // have — id policy stays in the application. Drizzle represents `uuid`
        // as a JS string, so better-auth handles these ids as the strings it
        // expects.
        generateId: () => randomUUID(),
      },
      // W4 security F3: the client address is the one `./client-ip.ts`
      // resolved — the Next proxy's claim when its secret checked out, else
      // what the nearest proxy saw — and never a header a caller wrote.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },

    /**
     * better-auth's per-IP limiter: on in production by its own default, and
     * keyed on {@link CLIENT_IP_HEADER} above.
     *
     * `memory`, not `database`: the actor host is one replica, where an
     * in-process counter is exact and costs nothing, and a database store
     * would put a write in front of every auth request — `./session-exchange-limit.ts`
     * has the replica arithmetic and when to switch.
     *
     * The two session exchanges the Next *server* makes are exempt from the
     * per-IP rule **only when the proxy secret verified** — they are counted
     * per session instead (`./session-exchange-limit.ts`). A browser or an
     * edge caller on the same paths keeps the per-IP limit.
     */
    rateLimit: {
      ...(config.rateLimitEnabled === undefined
        ? {}
        : { enabled: config.rateLimitEnabled }),
      storage: "memory",
      customRules: Object.fromEntries(
        SESSION_EXCHANGE_PATHS.map((path) => [
          path,
          (request: Request, current: { window: number; max: number }) =>
            isVerifiedProxy(request.headers) ? false : current,
        ]),
      ),
    },

    emailAndPassword: {
      enabled: true,
      // Matches the outgoing stack: nhost.toml sets passwordMinLength = 9.
      minPasswordLength: 9,
      password: createPassword({ rehash }),
    },

    user: {
      additionalFields: {
        // `input: false` on all three: these are server-owned. A sign-up body
        // that includes `role: "admin"` is dropped, not honoured.
        role: {
          type: "string",
          required: true,
          defaultValue: "user",
          input: false,
        },
        locale: { type: "string", required: false, input: false },
        disabled: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        // Deliberately no `trustedProviders`: a provider that does not assert a
        // verified email can never take over an existing local account.
        // `requireLocalEmailVerified` is left at its default (true), which
        // blocks the classic pre-hijack (attacker registers victim@… with a
        // password, victim later signs in with Google and lands in the
        // attacker's account). A migrated user whose Nhost `email_verified`
        // was false therefore signs in with their password and verifies the
        // address before OAuth will link — they are not locked out.
      },
    },

    databaseHooks: {
      user: {
        create: {
          // F2: never store an email-shaped or empty display name. See
          // `./display-name.ts` — the name is public, the address is not.
          before: async (user) => ({
            data: { ...user, name: displayNameForNewUser(user.name) },
          }),
        },
        update: {
          // `/update-user` takes `name` from the client. Refused rather than
          // rewritten: this user is choosing a name, and silently storing a
          // different one would be a surprise they only find on their profile.
          before: async (user) => {
            const refusal = displayNameUpdateRefusal(
              (user as { name?: unknown }).name,
            );
            if (refusal !== null) {
              throw new APIError("BAD_REQUEST", { message: refusal });
            }
          },
        },
      },
      session: {
        create: {
          // Nhost's `auth.users.disabled` was enforced by hasura-auth. Not
          // carrying it over would be a regression, so no session is issued
          // for a disabled user by any method.
          before: async (session) => {
            const rows = await db
              .select({ disabled: userTable.disabled })
              .from(userTable)
              .where(eq(userTable.id, session.userId))
              .limit(1);
            const row = rows[0];
            if (row?.disabled === true) return false;
          },
        },
        update: {
          /**
           * F8: no refresh for a disabled user. Refusing the *create* above
           * stopped new sessions; an existing one kept sliding forward —
           * `/get-session` and `/token` (whose `sessionMiddleware` goes through
           * `getSession`) both extend `expiresAt` once `updateAge` has passed,
           * so a session disabled mid-life could live on indefinitely.
           * hasura-auth refused refresh for a disabled user, and so does this.
           *
           * `getSession` sets `ctx.context.session` to the row it loaded —
           * user included, from the same query — before it calls
           * `updateSession`, so the snapshot here is the user being
           * refreshed. Returning `false` makes `updateSession` return `null`,
           * and `getSession` answers that by clearing the cookie and throwing
           * 401 (better-auth 1.7.3, `api/routes/session.mjs`).
           *
           * The session rows themselves are deleted by the database the
           * moment `disabled` flips (migration
           * `…_disabled_user_ends_sessions`); this and {@link refuseDisabled}
           * are what still hold if a row survives that — a restore with
           * triggers off, say.
           */
          before: async (_session, context) => {
            if (isDisabled(context?.context.session?.user)) return false;
          },
        },
      },
    },

    socialProviders,

    plugins: [
      jwt({
        jwt: {
          // Was the literal "15m". The rotation windows in
          // `./jwks-rotation.ts` are arithmetic on this number, so it is
          // declared there and spent here — the two cannot drift apart.
          expirationTime: `${String(TOKEN_TTL_SECONDS)}s`,
          issuer: config.baseUrl,
          audience: config.baseUrl,
          /**
           * A closed claim set. The default payload is the whole user row,
           * which would leak `disabled`/`locale` and grow silently with every
           * added column.
           */
          definePayload: ({ user }) => {
            refuseDisabled(user);
            return {
              email: user.email,
              emailVerified: user.emailVerified,
              role: tokenRole((user as Record<string, unknown>).role),
            };
          },
        },
        /**
         * Carries `gracePeriod` as well as the key pair config — see
         * `./jwks-rotation.ts`, which owns both halves of the number and hands
         * this same object to `createJwk` when it mints a rotation key, so a
         * minted key matches the running configuration exactly.
         *
         * `rotationInterval` is deliberately **not** set: better-auth's own
         * scheduled rotation mints the replacement inside the request that
         * first signs with it, which `services/api` can reject outright.
         */
        jwks: JWKS_PLUGIN_OPTIONS,
      }),
    ],
  });

  return { auth, db, pool };
};

export { tokenRole };
