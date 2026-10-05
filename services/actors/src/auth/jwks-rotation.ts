/**
 * Overlapping JWKS key rotation.
 *
 * The problem this replaces: the only answer to a compromised signing key was
 * the instruction in `./config.ts` — "delete the rows in the `jwks` table so a
 * fresh keypair is minted". That is a *reset*, not a rotation. It logs every
 * user out, and it was written for one incident (`8aad88da`, a
 * `BETTER_AUTH_SECRET` that had been committed to `infra/.env.example`) where
 * logging everyone out was the point.
 *
 * ## What better-auth 1.7.3 already gives us
 *
 * Read out of `node_modules/better-auth/dist/plugins/jwt/`, not the docs:
 *
 *   - **A multi-key set.** `index.mjs`'s `getJwks` handler serves *every* row
 *     of the `jwks` table, filtered only by
 *     `!key.expiresAt || key.expiresAt.getTime() + gracePeriod > now`. It reads
 *     the table on every request — there is no in-process cache — so a row
 *     appears at `/api/auth/jwks` the instant it commits.
 *   - **Key selection by `kid`.** `sign.mjs`'s `signJWT` stamps
 *     `setProtectedHeader({ alg, kid })` with `kid = key.id`, and jose's
 *     `createLocalJWKSet` (`jose/dist/webapi/jwks/local.js`) matches candidates
 *     on exactly that. So `services/api` verifies a multi-key set natively.
 *   - **A signing-key rule we can steer.** With no override, `resolveSigningKey`
 *     takes `adapter.getLatestKeyByAlg(primaryAlg) ?? adapter.getLatestKey()`,
 *     and both (`adapter.mjs`) mean *the most recently created **live** key*,
 *     where live is `!expiresAt || expiresAt > now`.
 *
 * So `expires_at` is not "when this key dies". It is **"when this key stops
 * signing"** — verification continues for a further `gracePeriod`. That single
 * fact is the whole overlap primitive, and it means rotation needs no new
 * table, no new column and **no migration**: `packages/db/src/schema/tables.ts`
 * already carries `created_at`, `expires_at`, `alg` and `crv` on `jwks`.
 *
 * ## What it does not give us, and why `rotationInterval` is a trap
 *
 * better-auth's own scheduled rotation is `jwks.rotationInterval`, which stamps
 * `expiresAt = createdAt + interval` at mint time (`utils.mjs`). When that
 * instant passes, the *next* `resolveSigningKey` finds no live key and mints a
 * replacement **in the same call that signs with it** (`sign.mjs`:
 * `if (!key || key.expiresAt < new Date()) key = await createJwk(...)`).
 *
 * The new key is therefore published and first used at the same instant, and
 * `services/api` may not accept it. `createRemoteJWKSet`
 * (`jose/dist/webapi/jwks/remote.js`) refetches on an unknown `kid` *only when
 * it is not cooling down* — `cooldownDuration: 30 * 1000` in
 * `services/api/src/auth/jwt.ts` — and otherwise throws `JWKSNoMatchingKey`.
 * With `cacheMaxAge: 10 * 60 * 1000` the verifier refetches roughly every
 * 600s under load, so there is a ~30-in-600 chance that the switchover lands
 * inside a cooldown, and every token minted during it fails to verify until the
 * cooldown lapses. That is a coin-flip-weighted 30-second auth outage, which is
 * exactly the thing rotation is supposed to avoid. **`rotationInterval` is
 * deliberately left unset** (`./auth.ts`).
 *
 * ## The design: three states on the columns that already exist
 *
 * | state        | `expires_at`              | signs? | at `/jwks`?                    |
 * |--------------|---------------------------|--------|--------------------------------|
 * | `active`     | `NULL`, newest live       | yes    | yes, indefinitely              |
 * | `standby`    | **exactly** `created_at`  | no     | yes, for `gracePeriod`         |
 * | `retiring`   | a past instant > created  | no     | yes, for `gracePeriod` after it|
 * | `superseded` | `NULL`, not newest live   | no     | yes, indefinitely              |
 * | `unpublished`| past `expires_at + grace` | no     | **no** — `retire` deletes it   |
 *
 * `standby` is the state better-auth has no name for and the one that makes
 * overlap possible on the *publishing* side: a key whose `expires_at` equals
 * its `created_at` is not live, so `getLatestKeyByAlg` filters it out and it can
 * never be chosen to sign — while `getJwks` still serves it, because its grace
 * window has not lapsed. Published and trusted, before it signs anything.
 * Nothing is being lied to: both of better-auth's readings of that row are
 * exactly what we mean by it.
 *
 * "Before it signs anything" holds only because the row is **born** standby:
 * {@link publishStandby} writes `expires_at = created_at` in the same `INSERT`
 * that creates it. It used to insert through better-auth's default adapter
 * (no `expires_at` — live) and mark the row standby with a second statement,
 * and in between the new key was the newest live key, which every replica's
 * next sign would have picked. See `publishStandby`.
 *
 * Rotation is then two operator steps with a soak between them:
 *
 *   1. `publish` — mint a standby. Every verifier that refetches from now on
 *      picks it up.
 *   2. wait {@link STANDBY_SOAK_SECONDS}, then `promote` — clear the standby's
 *      `expires_at` (it becomes the newest live key, so it signs) and stamp the
 *      outgoing key's `expires_at` with now (it stops signing, keeps verifying).
 *
 * `promote` takes effect across every actor replica with **no restart**:
 * `resolveSigningKey` reads the table on every single sign, caching nothing.
 *
 * ## Why operator-triggered and not scheduled
 *
 * The gap between the two steps has to exceed a fact about the *verifier's*
 * deployment — how stale a `services/api` JWKS cache may be — which this
 * process cannot observe. A scheduler that got that wrong would fail the way
 * `rotationInterval` fails, silently and intermittently. Cron can still drive
 * hygiene rotation by running the two subcommands on two schedules; `status`
 * exists so that step 2 can check rather than assume, and `promote` refuses
 * outright when the soak has not elapsed.
 */
import { randomUUID } from "node:crypto";
import { jwks as jwksTable } from "@cellar-assistant/db";
import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "@cellar-assistant/db/orm";
import { createJwk } from "better-auth/plugins";
import type { AuthDb } from "./db.ts";

/**
 * The `jwt` plugin's token lifetime, in seconds.
 *
 * Declared here rather than as the string literal `"15m"` inside `./auth.ts`
 * because the rotation windows below are arithmetic on it. `./auth.ts` consumes
 * this constant, so the two cannot drift.
 */
export const TOKEN_TTL_SECONDS = 900;

/**
 * `cacheMaxAge` on `createRemoteJWKSet` in `services/api/src/auth/jwt.ts`.
 *
 * **A copy of a number that lives in another service**, and the one coupling in
 * this file that a type checker cannot enforce. It is duplicated rather than
 * imported because `services/api` is a separate package that this one must not
 * depend on — it holds no database credentials and asserts as much on boot.
 * `./jwks-rotation.test.ts` pins the relationship that actually matters
 * (`STANDBY_SOAK_SECONDS >= this`); if the verifier ever raises its cache
 * lifetime, raise the soak with it.
 */
export const API_JWKS_CACHE_MAX_AGE_SECONDS = 600;

/** `clockTolerance` on `jwtVerify` in `services/api/src/auth/jwt.ts`. */
export const API_CLOCK_TOLERANCE_SECONDS = 5;

/**
 * How long a standby must sit in the published set before it may sign.
 *
 * Must be at least {@link API_JWKS_CACHE_MAX_AGE_SECONDS}: past that age jose's
 * `fresh()` is false, so the *next* verification reloads the set before it even
 * looks for the `kid` (`remote.js`: `if (!this.#local || !this.fresh()) await
 * this.reload()`). Every verifier therefore either already refetched during the
 * soak or is forced to refetch on its next token — in both cases it knows the
 * new `kid` before one arrives, and the 30-second cooldown never comes into it.
 *
 * 900 rather than exactly 600 buys a 50% margin for a verifier whose fetch
 * fails once and retries.
 */
export const STANDBY_SOAK_SECONDS = 900;

/**
 * `jwks.gracePeriod` for the plugin: how long a key keeps *verifying* after it
 * stops *signing*.
 *
 * better-auth's default is 2592000 — **thirty days**. That is the wrong default
 * for the case rotation exists to serve: after rotating away from a leaked key,
 * that key would keep verifying forged tokens for a month. The requirement is
 * only that the last token a key signed must outlive the key, so the floor is
 * {@link TOKEN_TTL_SECONDS} + {@link API_CLOCK_TOLERANCE_SECONDS} = 905s. 1800
 * is twice the token lifetime: comfortably above the floor, and a retired key
 * is out of the published set within half an hour.
 *
 * It also bounds the standby window — a standby is published for `gracePeriod`
 * after `publish` — so an abandoned rotation cleans itself up, and `promote`
 * refuses once it has lapsed.
 */
export const JWKS_GRACE_PERIOD_SECONDS = 1800;

/**
 * The `jwks` half of the `jwt` plugin options, shared by `./auth.ts` (which
 * configures the plugin) and {@link publishStandby} (which hands the same
 * options to better-auth's own `createJwk`, so a minted key matches the
 * running configuration's algorithm and encryption exactly).
 */
export const JWKS_PLUGIN_OPTIONS = {
  // jose's default for this plugin; small tokens, fast verification.
  keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
  gracePeriod: JWKS_GRACE_PERIOD_SECONDS,
  // rotationInterval is deliberately absent — see the header.
} as const;

/**
 * Every state a row in `jwks` can be in, as better-auth reads it.
 *
 * `superseded` has no part in this procedure; it is what a *second* live key
 * looks like, which happens when better-auth auto-mints one (two concurrent
 * signs against an empty table, say). It is reported so the operator can see it
 * rather than being quietly folded into `active`.
 */
export type JwkState =
  | "active"
  | "standby"
  | "retiring"
  | "superseded"
  | "unpublished";

export type JwkRecord = {
  id: string;
  createdAt: Date;
  expiresAt: Date | null;
};

export type ClassifiedJwk = JwkRecord & {
  state: JwkState;
  /** When `/jwks` stops serving this key. `null` = for as long as it exists. */
  publishedUntil: Date | null;
  /** `standby` only: the window in which {@link promoteStandby} is safe. */
  promotableFrom: Date | null;
  promotableUntil: Date | null;
};

const addSeconds = (at: Date, seconds: number): Date =>
  new Date(at.getTime() + seconds * 1000);

const isLive = (key: JwkRecord, now: Date): boolean =>
  key.expiresAt === null || key.expiresAt.getTime() > now.getTime();

/**
 * A standby is marked by `expires_at` being **exactly** `created_at`.
 *
 * Exact, not approximate: {@link publishStandby} writes it with SQL
 * `expires_at = created_at`, so the two are the same stored value and no
 * timestamp-precision question arises. It is also a mark nothing else produces
 * — better-auth only ever writes `expiresAt = createdAt + rotationInterval`,
 * and this codebase leaves `rotationInterval` unset, so a zero-length signing
 * life can only have come from here.
 */
const isStandby = (key: JwkRecord): boolean =>
  key.expiresAt !== null && key.expiresAt.getTime() === key.createdAt.getTime();

/**
 * Pure. Given the rows and an instant, say what each key is and what may be
 * done with it. Separated from the queries so the state machine can be tested
 * without a database — the database half is three one-line statements.
 */
export const classifyJwks = (
  rows: readonly JwkRecord[],
  now: Date,
  gracePeriodSeconds: number = JWKS_GRACE_PERIOD_SECONDS,
): ClassifiedJwk[] => {
  const live = rows.filter((row) => isLive(row, now));
  const newestLive = live.reduce<JwkRecord | undefined>(
    (best, row) =>
      best === undefined || row.createdAt.getTime() > best.createdAt.getTime()
        ? row
        : best,
    undefined,
  );

  return rows.map((row) => {
    const publishedUntil =
      row.expiresAt === null
        ? null
        : addSeconds(row.expiresAt, gracePeriodSeconds);
    const stillPublished =
      publishedUntil === null || publishedUntil.getTime() > now.getTime();

    const state: JwkState = isLive(row, now)
      ? row.id === newestLive?.id
        ? "active"
        : "superseded"
      : !stillPublished
        ? "unpublished"
        : isStandby(row)
          ? "standby"
          : "retiring";

    return {
      ...row,
      state,
      publishedUntil,
      promotableFrom:
        state === "standby"
          ? addSeconds(row.createdAt, STANDBY_SOAK_SECONDS)
          : null,
      promotableUntil: state === "standby" ? publishedUntil : null,
    };
  });
};

const readJwks = async (db: AuthDb): Promise<JwkRecord[]> =>
  await db
    .select({
      id: jwksTable.id,
      createdAt: jwksTable.createdAt,
      expiresAt: jwksTable.expiresAt,
    })
    .from(jwksTable);

/** Every key with its state, newest first. */
export const jwksStatus = async (
  db: AuthDb,
  now: Date = new Date(),
): Promise<ClassifiedJwk[]> =>
  classifyJwks(await readJwks(db), now).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

/**
 * `createJwk` reaches for exactly two things on the object it is handed —
 * `ctx.context.adapter` and `ctx.context.secretConfig` (`utils.mjs`) — and an
 * `auth` instance's `$context` is where both live. Its parameter is typed as a
 * full endpoint context, which this is not, so the shape is narrowed here
 * rather than by importing `@better-auth/core`: that package is better-auth's
 * own dependency, not a declared one of this service, and under bun's isolated
 * linker importing it would be a phantom dependency.
 */
type JwkMintContext = Parameters<typeof createJwk>[0];

/** The key `createJwk` generated and encrypted, before it has an id or a row. */
type CreateJwkHook = NonNullable<
  NonNullable<
    NonNullable<Parameters<typeof createJwk>[1]>["adapter"]
  >["createJwk"]
>;
type MintedJwk = Parameters<CreateJwkHook>[0];
type StoredJwk = Awaited<ReturnType<CreateJwkHook>>;

type MintableAuth = {
  $context: Promise<{ adapter: unknown; secretConfig: unknown }>;
};

/**
 * Write a freshly minted key as a standby, in one statement.
 *
 * `expires_at` and `created_at` are the same parameter, so the two stored
 * values are equal whatever the column precision — the mark
 * {@link isStandby} tests. And they are written by the `INSERT` that creates
 * the row, so no reader ever sees this key without the mark: there is no
 * instant at which it is live, and so none at which `resolveSigningKey` could
 * choose it. The id is a v4 uuid, as `./auth.ts`'s `generateId` makes for the
 * adapter's own inserts.
 */
const insertStandby = async (
  db: AuthDb,
  key: MintedJwk,
): Promise<StoredJwk> => {
  const id = randomUUID();
  await db.insert(jwksTable).values({
    id,
    publicKey: key.publicKey,
    privateKey: key.privateKey,
    createdAt: key.createdAt,
    expiresAt: key.createdAt,
    alg: key.alg ?? null,
    crv: key.crv ?? null,
  });
  return { ...key, id, expiresAt: key.createdAt };
};

/**
 * Step 1 of 2. Mint a key, publish it, and keep it from signing.
 *
 * The key is generated by better-auth's own `createJwk` — so the algorithm,
 * the curve and the `BETTER_AUTH_SECRET`-keyed encryption of the private half
 * are whatever the running configuration says, not a second implementation of
 * them. Only the *write* is ours: `createJwk` hands the finished key to the
 * plugin's `adapter.createJwk` hook when one is given, and {@link
 * insertStandby} stores it already marked standby.
 *
 * It used to be two statements — better-auth's own insert, with no
 * `expires_at`, then an `UPDATE` setting `expires_at = created_at`. Between
 * them the new row was live and the newest, which is exactly what
 * `resolveSigningKey` signs with, so a replica signing in that gap issued a
 * token under a `kid` no verifier had yet had a chance to fetch — the
 * `rotationInterval` failure this module exists to avoid, on a smaller window.
 *
 * Refuses if a standby already exists: one rotation at a time, or `promote`
 * could not tell which key it was being asked to promote.
 */
export const publishStandby = async (
  auth: MintableAuth,
  db: AuthDb,
): Promise<ClassifiedJwk> => {
  const existing = await jwksStatus(db);
  const standby = existing.find((key) => key.state === "standby");
  if (standby !== undefined) {
    throw new Error(
      `[jwks] a standby key already exists (kid ${standby.id}, published ` +
        `${standby.createdAt.toISOString()}). Promote or retire it before ` +
        "publishing another.",
    );
  }

  const context = await auth.$context;
  const minted = await createJwk({ context } as unknown as JwkMintContext, {
    jwks: JWKS_PLUGIN_OPTIONS,
    // Born standby, in one INSERT — see `insertStandby` and this function's
    // doc. The hook receives the key `createJwk` already generated and
    // encrypted; it decides only how the row is written.
    adapter: { createJwk: (key) => insertStandby(db, key) },
  });

  // Deliberately a *fresh* clock read, not one taken before the mint: the row's
  // `created_at` — and therefore its `expires_at` — is stamped inside
  // `createJwk`, so it is a few milliseconds in the future relative to any
  // instant captured before that call, and against such an instant the standby
  // would read as live. Every real reader (`getJwks`, `resolveSigningKey`)
  // takes its own `new Date()` after the insert has committed, so this matches
  // what they will see.
  const after = await jwksStatus(db, new Date());
  const published = after.find((key) => key.id === minted.id);
  if (published === undefined || published.state !== "standby") {
    throw new Error(
      `[jwks] minted ${minted.id} but it did not land in the standby state ` +
        `(got ${published?.state ?? "no row"}). Nothing has been promoted; ` +
        "inspect the jwks table before retrying.",
    );
  }
  return published;
};

export type PromotionResult = {
  /** The key that now signs. */
  promoted: ClassifiedJwk;
  /** Keys that stopped signing and are now verifying out their grace period. */
  retiring: ClassifiedJwk[];
  /** When the last token signed by a retired key expires. */
  lastOldTokenExpiresAt: Date;
};

/**
 * Step 2 of 2. The standby starts signing; whatever was signing stops, and
 * keeps verifying.
 *
 * One transaction, so there is no instant at which two keys are live or none
 * is — and the transaction checks that before it commits, not after. Both
 * halves are a write to `expires_at` and nothing else:
 *
 *   - the standby's goes to `NULL`, making it live and — as the only live key
 *     — the one `resolveSigningKey` returns;
 *   - each outgoing key's goes to `now`, which stops `getLatestKeyByAlg`
 *     selecting it while `getJwks` keeps serving it for `gracePeriod`.
 *
 * `force` skips the soak, and only the soak — for the case where a key is known
 * to be compromised and up to 30 seconds of `JWKSNoMatchingKey` is the better
 * trade. It cannot reach a standby that has already aged out of `/jwks`,
 * because such a row is no longer classified `standby` at all: a verifier that
 * refetched in the meantime has dropped it, and no amount of urgency makes
 * signing with it safe. Publish another one — it costs a keypair.
 */
export const promoteStandby = async (
  db: AuthDb,
  options: { force?: boolean; now?: Date } = {},
): Promise<PromotionResult> => {
  const now = options.now ?? new Date();
  const keys = await jwksStatus(db, now);
  const standbys = keys.filter((key) => key.state === "standby");

  if (standbys.length === 0) {
    // A standby that has aged out of the published set is classified
    // `unpublished`, not `standby` — so without this it would be reported as
    // "no standby", which is both false and unactionable. It is still the same
    // row, and the fix is still to publish another one.
    const lapsed = keys.find(
      (key) => key.state === "unpublished" && isStandby(key),
    );
    throw new Error(
      lapsed === undefined
        ? "[jwks] no standby key to promote. Run `publish` first, then wait " +
            `${STANDBY_SOAK_SECONDS}s.`
        : `[jwks] standby ${lapsed.id} aged out of the published key set at ` +
            `${lapsed.publishedUntil?.toISOString() ?? "?"}; a verifier that ` +
            "refetched since then no longer has it, so signing with it now " +
            "would be rejected. Run `publish` again.",
    );
  }
  if (standbys.length > 1) {
    throw new Error(
      `[jwks] ${standbys.length} standby keys exist (${standbys
        .map((key) => key.id)
        .join(", ")}). Retire all but one before promoting.`,
    );
  }
  const standby = standbys[0] as ClassifiedJwk;
  const promotableFrom = standby.promotableFrom as Date;
  if (options.force !== true && promotableFrom.getTime() > now.getTime()) {
    const remaining = Math.ceil(
      (promotableFrom.getTime() - now.getTime()) / 1000,
    );
    throw new Error(
      `[jwks] standby ${standby.id} has only been published for ` +
        `${Math.floor((now.getTime() - standby.createdAt.getTime()) / 1000)}s; ` +
        `it may sign from ${promotableFrom.toISOString()} (${remaining}s away). ` +
        "Until then a services/api holding a JWKS cache older than the key " +
        "would reject every token it signs. Pass --force only if the outgoing " +
        "key is compromised and a brief outage beats leaving it live.",
    );
  }

  const outgoing = keys.filter(
    (key) => key.state === "active" || key.state === "superseded",
  );
  const outgoingIds = outgoing.map((key) => key.id);

  await db.transaction(async (tx) => {
    if (outgoingIds.length > 0) {
      await tx
        .update(jwksTable)
        .set({ expiresAt: now })
        .where(inArray(jwksTable.id, outgoingIds));
    }
    // Only if it is *still* the standby we classified: a forced `retire` can
    // delete it between the read above and this statement. Unchecked, the
    // outgoing keys had already stopped signing and this matched no row, so
    // the transaction committed with **no live key at all** — better-auth
    // then mints one inside the next sign, unpublished — and the check below
    // it only ran after the commit.
    const promoted = await tx
      .update(jwksTable)
      .set({ expiresAt: null })
      .where(
        and(
          eq(jwksTable.id, standby.id),
          eq(jwksTable.expiresAt, jwksTable.createdAt),
        ),
      )
      .returning({ id: jwksTable.id });
    if (promoted.length !== 1) {
      throw new Error(
        `[jwks] standby ${standby.id} is gone or no longer a standby (a ` +
          "concurrent retire or promote?). Nothing was changed: the " +
          "outgoing key still signs. Run `status` and start again.",
      );
    }
    // And the end state, before it becomes anyone's: exactly one live key,
    // the one just promoted. Anything else — a key auto-minted since the
    // read, say — would be what better-auth signs with instead.
    const live = await tx
      .select({ id: jwksTable.id })
      .from(jwksTable)
      .where(or(isNull(jwksTable.expiresAt), gt(jwksTable.expiresAt, now)));
    if (live.length !== 1 || live[0]?.id !== standby.id) {
      throw new Error(
        `[jwks] promoting ${standby.id} would leave ${String(live.length)} ` +
          `live key(s) (${live.map((key) => key.id).join(", ") || "none"}), ` +
          "not exactly it. Nothing was changed. Run `status`.",
      );
    }
  });

  const after = await jwksStatus(db, now);
  const promoted = after.find((key) => key.id === standby.id);
  if (promoted === undefined || promoted.state !== "active") {
    throw new Error(
      `[jwks] promoted ${standby.id} but it is ${promoted?.state ?? "gone"}, ` +
        "not active. Inspect the jwks table.",
    );
  }
  return {
    promoted,
    retiring: after.filter((key) => outgoingIds.includes(key.id)),
    lastOldTokenExpiresAt: addSeconds(
      now,
      TOKEN_TTL_SECONDS + API_CLOCK_TOLERANCE_SECONDS,
    ),
  };
};

/**
 * Delete key rows that `/jwks` no longer serves.
 *
 * Unpublishing and deleting are different things, and for a compromise only the
 * second one helps: an `unpublished` row still holds the private key, encrypted
 * under `BETTER_AUTH_SECRET`. Deleting a row better-auth already omits from the
 * key set cannot break a verification that was going to succeed, which is what
 * makes the default safe.
 *
 * That safety rests on this process and the *running* actor host agreeing on
 * {@link JWKS_GRACE_PERIOD_SECONDS}, since each decides independently which
 * keys `/jwks` still serves. They agree by construction — both read
 * {@link JWKS_PLUGIN_OPTIONS} — but a CLI built from a tree the host has not
 * been redeployed from is applying a rule the host is not.
 *
 * `force` with an explicit `kid` deletes a key that is still published —
 * the compromise case, where every token that key signed must stop verifying
 * now. That *does* log out everyone holding one. It refuses to delete the
 * active signer, because that leaves better-auth to auto-mint a replacement
 * mid-request, which is the `rotationInterval` failure this module exists to
 * avoid; promote a standby first.
 */
export const retireKeys = async (
  db: AuthDb,
  options: { kid?: string; force?: boolean; now?: Date } = {},
): Promise<ClassifiedJwk[]> => {
  const now = options.now ?? new Date();
  const keys = await jwksStatus(db, now);

  let doomed: ClassifiedJwk[];
  if (options.kid === undefined) {
    doomed = keys.filter((key) => key.state === "unpublished");
  } else {
    const target = keys.find((key) => key.id === options.kid);
    if (target === undefined) {
      throw new Error(`[jwks] no key with kid ${options.kid}`);
    }
    if (target.state === "active") {
      throw new Error(
        `[jwks] ${target.id} is the active signing key. Deleting it would ` +
          "leave better-auth to mint a replacement inside the next signing " +
          "request, with no chance for any verifier to learn the new kid. " +
          "Run `publish`, wait, `promote`, then retire this one.",
      );
    }
    if (target.state !== "unpublished" && options.force !== true) {
      throw new Error(
        `[jwks] ${target.id} is still in the published key set until ` +
          `${target.publishedUntil?.toISOString() ?? "never"}; deleting it now ` +
          "invalidates every token it signed. Wait, or pass --force if it is " +
          "compromised.",
      );
    }
    doomed = [target];
  }

  // Each row is deleted only if it is still in the state it was classified
  // in. The reverse of `promoteStandby`'s race: a forced retire of a standby
  // that a concurrent promote has just made the signing key would otherwise
  // delete the one live key. Under read committed a DELETE that waited on the
  // promote's row lock re-checks its WHERE against the committed row, so an
  // `expires_at` that moved no longer matches.
  const deleted: ClassifiedJwk[] = [];
  for (const key of doomed) {
    const rows = await db
      .delete(jwksTable)
      .where(
        and(
          eq(jwksTable.id, key.id),
          key.expiresAt === null
            ? isNull(jwksTable.expiresAt)
            : // At the millisecond the value was read back at: a row
              // written by SQL rather than by a JS Date carries
              // microseconds, which the read truncated.
              sql`date_trunc('milliseconds', ${jwksTable.expiresAt}) = ${key.expiresAt.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: jwksTable.id });
    if (rows.length === 1) {
      deleted.push(key);
    } else if (options.kid !== undefined) {
      throw new Error(
        `[jwks] ${key.id} changed state since it was read (was ${key.state}); ` +
          "nothing was deleted. Run `status` and decide again.",
      );
    }
  }
  return deleted;
};
