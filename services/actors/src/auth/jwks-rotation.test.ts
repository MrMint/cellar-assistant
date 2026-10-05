/**
 * JWKS rotation: the state machine in isolation, and the overlap proved end to
 * end against a real database and better-auth's real signing path.
 *
 * The claim the integration test exists to establish is the one the whole
 * design is for: **a token signed by the outgoing key still verifies against
 * the published key set after the incoming key has taken over signing.** Not
 * "the code ran" — a specific JWT, minted before the rotation, verified after
 * it, against the bytes `/api/auth/jwks` actually served.
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { jwks as jwksTable } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { hash as bcryptHash } from "bcryptjs";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
} from "jose";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import type { AuthDb } from "./db.ts";
import {
  API_CLOCK_TOLERANCE_SECONDS,
  API_JWKS_CACHE_MAX_AGE_SECONDS,
  classifyJwks,
  JWKS_GRACE_PERIOD_SECONDS,
  type JwkRecord,
  jwksStatus,
  promoteStandby,
  publishStandby,
  retireKeys,
  STANDBY_SOAK_SECONDS,
  TOKEN_TTL_SECONDS,
} from "./jwks-rotation.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const DB = "auth_test_jwks_rotation";
const BASE = "http://localhost:3002";
const PASSWORD = "123456789";
const USER = "3f9b2c14-7d5e-4a61-9c28-0b4f6e8d1a37";

const at = (seconds: number): Date => new Date(seconds * 1000);

const run = promisify(execFile);
const CLI = fileURLToPath(new URL("./rotate-jwks.ts", import.meta.url));
/** `testConfig`'s secret, so the CLI decrypts the same keys the suite minted. */
const CLI_SECRET = "test-secret-not-used-anywhere-else-000000000";

describe("rotation windows", () => {
  /**
   * The load-bearing inequality, and the reason the soak exists at all. Below
   * `cacheMaxAge` a `services/api` can still be holding a key set that predates
   * the standby, and jose throws `JWKSNoMatchingKey` outright when its 30s
   * cooldown is active (`jose/dist/webapi/jwks/remote.js`).
   */
  it("soaks a standby for at least as long as a verifier caches the key set", () => {
    expect(STANDBY_SOAK_SECONDS).toBeGreaterThanOrEqual(
      API_JWKS_CACHE_MAX_AGE_SECONDS,
    );
  });

  /** A retired key must outlive the last token it signed, or that token dies with it. */
  it("keeps a retired key verifying past the last token it could have signed", () => {
    expect(JWKS_GRACE_PERIOD_SECONDS).toBeGreaterThan(
      TOKEN_TTL_SECONDS + API_CLOCK_TOLERANCE_SECONDS,
    );
  });

  /** Otherwise `promote` has no window it can legally run in. */
  it("leaves a usable window between the soak and the standby ageing out", () => {
    expect(JWKS_GRACE_PERIOD_SECONDS).toBeGreaterThan(STANDBY_SOAK_SECONDS);
  });
});

describe("classifyJwks", () => {
  const active: JwkRecord = {
    id: "active",
    createdAt: at(1000),
    expiresAt: null,
  };

  it("calls the newest live key active and an older live key superseded", () => {
    const older: JwkRecord = {
      id: "older",
      createdAt: at(500),
      expiresAt: null,
    };
    const states = new Map(
      classifyJwks([active, older], at(2000)).map((k) => [k.id, k.state]),
    );
    expect(states.get("active")).toBe("active");
    expect(states.get("older")).toBe("superseded");
  });

  it("recognises expires_at === created_at as a standby", () => {
    const standby: JwkRecord = {
      id: "standby",
      createdAt: at(1500),
      expiresAt: at(1500),
    };
    const [, classified] = classifyJwks([active, standby], at(1600));
    expect(classified?.state).toBe("standby");
    // Published from the moment it exists; signs only after the soak.
    expect(classified?.promotableFrom).toEqual(at(1500 + STANDBY_SOAK_SECONDS));
    expect(classified?.promotableUntil).toEqual(
      at(1500 + JWKS_GRACE_PERIOD_SECONDS),
    );
  });

  it("calls a key that stopped signing retiring, then unpublished", () => {
    const retired: JwkRecord = {
      id: "retired",
      createdAt: at(100),
      expiresAt: at(1000),
    };
    const during = classifyJwks([active, retired], at(1000 + 10));
    expect(during.find((k) => k.id === "retired")?.state).toBe("retiring");

    const after = classifyJwks(
      [active, retired],
      at(1000 + JWKS_GRACE_PERIOD_SECONDS + 1),
    );
    expect(after.find((k) => k.id === "retired")?.state).toBe("unpublished");
  });

  /**
   * A standby is distinguishable from a retiring key *only* by the equality of
   * the two timestamps, so this is the invariant the mark rests on: one second
   * of signing life is a retiring key, zero is a standby.
   */
  it("does not mistake a briefly-lived retiring key for a standby", () => {
    const brief: JwkRecord = {
      id: "brief",
      createdAt: at(1500),
      expiresAt: at(1501),
    };
    expect(classifyJwks([brief], at(1600))[0]?.state).toBe("retiring");
  });
});

describe("JWKS rotation, end to end", () => {
  let url: string;
  let auth: AuthInstance;
  let db: AuthDb;
  let close: () => Promise<void>;

  const jwks = async (): Promise<Parameters<typeof createLocalJWKSet>[0]> =>
    (await (
      await auth.handler(new Request(`${BASE}/api/auth/jwks`))
    ).json()) as Parameters<typeof createLocalJWKSet>[0];

  const kids = async (): Promise<string[]> =>
    ((await jwks()).keys as { kid: string }[]).map((k) => k.kid).toSorted();

  /** A real token off the real endpoint, the way the client gets one. */
  const mintToken = async (): Promise<string> => {
    const signedIn = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: PASSWORD }),
      }),
    );
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/token`, { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { token: string }).token;
  };

  /** Exactly what `services/api` does: verify against the published set. */
  const verifies = async (token: string): Promise<boolean> => {
    try {
      await jwtVerify(token, createLocalJWKSet(await jwks()), {
        issuer: BASE,
        audience: BASE,
        algorithms: ["EdDSA"],
        clockTolerance: API_CLOCK_TOLERANCE_SECONDS,
      });
      return true;
    } catch {
      return false;
    }
  };

  beforeAll(async () => {
    url = await resetScratchDatabase(DB);
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, locale, disabled)
         VALUES ($1, 'test', 'test@test.com', true, now(), now(), 'user', 'en', false)`,
        [USER],
      );
      await client.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
        [USER, USER, await bcryptHash(PASSWORD, 10)],
      );
    } finally {
      await client.end();
    }
    const created = makeTestAuth(url);
    auth = created.auth;
    db = created.db;
    close = () => created.pool.end();
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  it("rotates without invalidating a token signed by the outgoing key", async () => {
    // ---- before ----------------------------------------------------------
    // better-auth mints the first key lazily; this is the steady state.
    const oldToken = await mintToken();
    const oldKid = decodeProtectedHeader(oldToken).kid as string;
    expect(await kids()).toEqual([oldKid]);
    expect(await verifies(oldToken)).toBe(true);

    // ---- publish ---------------------------------------------------------
    const standby = await publishStandby(auth, db);
    expect(standby.state).toBe("standby");
    expect(standby.id).not.toBe(oldKid);

    // The new key is in the published set immediately…
    expect(await kids()).toEqual([oldKid, standby.id].toSorted());
    // …and signs nothing. THIS is "published and trusted before it signs".
    const duringSoak = await mintToken();
    expect(decodeProtectedHeader(duringSoak).kid).toBe(oldKid);

    // A promote before the soak elapses is refused, by name.
    await expect(promoteStandby(db)).rejects.toThrow(/has only been published/);

    // ---- promote ---------------------------------------------------------
    // `force` skips only the wall-clock wait, which a test cannot spend; every
    // other check still runs.
    const result = await promoteStandby(db, { force: true });
    expect(result.promoted.id).toBe(standby.id);
    expect(result.retiring.map((k) => k.id)).toEqual([oldKid]);

    // Signing has moved — with no restart of anything.
    const newToken = await mintToken();
    expect(decodeProtectedHeader(newToken).kid).toBe(standby.id);

    // ---- the claim -------------------------------------------------------
    // Both keys are still published, and the token minted before any of this
    // started still verifies.
    expect(await kids()).toEqual([oldKid, standby.id].toSorted());
    expect(await verifies(oldToken)).toBe(true);
    expect(await verifies(duringSoak)).toBe(true);
    expect(await verifies(newToken)).toBe(true);

    // The outgoing key is verifying out its grace period, not gone.
    const after = await jwksStatus(db);
    expect(after.find((k) => k.id === oldKid)?.state).toBe("retiring");
    expect(after.find((k) => k.id === standby.id)?.state).toBe("active");
  }, 60_000);

  /**
   * An aged-out standby is classified `unpublished`, not `standby`, so the
   * naive message would be "no standby key" — false, and unactionable.
   */
  it("says a standby aged out rather than that there is none", async () => {
    const standby = await publishStandby(auth, db);
    const lapsed = new Date(
      standby.createdAt.getTime() + (JWKS_GRACE_PERIOD_SECONDS + 1) * 1000,
    );
    try {
      await expect(
        promoteStandby(db, { now: lapsed, force: true }),
      ).rejects.toThrow(/aged out of the published key set/);
    } finally {
      await retireKeys(db, { kid: standby.id, force: true });
    }
  });

  it("refuses to publish a second standby while one is in flight", async () => {
    const standby = await publishStandby(auth, db);
    try {
      await expect(publishStandby(auth, db)).rejects.toThrow(
        /standby key already exists/,
      );
    } finally {
      await retireKeys(db, { kid: standby.id, force: true });
    }
  });

  it("refuses to delete the active signing key", async () => {
    const active = (await jwksStatus(db)).find((k) => k.state === "active");
    expect(active).toBeDefined();
    await expect(
      retireKeys(db, { kid: active?.id, force: true }),
    ).rejects.toThrow(/active signing key/);
  });

  it("retires only keys the key set no longer serves", async () => {
    const before = await jwksStatus(db);
    const retiring = before.find((k) => k.state === "retiring");
    if (retiring?.expiresAt == null) {
      throw new Error("expected a retiring key from the rotation above");
    }

    // Still published: nothing to do, and the key stays.
    expect(await retireKeys(db)).toEqual([]);
    expect(await kids()).toContain(retiring.id);

    // Past its grace period, `/jwks` has already dropped it — so deleting the
    // row cannot break a verification that was going to succeed.
    const afterGrace = new Date(
      retiring.expiresAt.getTime() + (JWKS_GRACE_PERIOD_SECONDS + 1) * 1000,
    );
    const deleted = await retireKeys(db, { now: afterGrace });
    expect(deleted.map((k) => k.id)).toEqual([retiring.id]);
    expect(await kids()).not.toContain(retiring.id);
  });

  /**
   * The other half of the compromise story: unpublishing is not deleting, and
   * only deleting takes the private key out of the database.
   */
  it("can force a compromised key out of the set immediately, and says so by logging that token out", async () => {
    const doomedToken = await mintToken();
    const doomedKid = decodeProtectedHeader(doomedToken).kid as string;
    expect(await verifies(doomedToken)).toBe(true);

    // Rotate away from it first — `retire --force` refuses the active key.
    const standby = await publishStandby(auth, db);
    await promoteStandby(db, { force: true });
    // Still fine: this is the overlap.
    expect(await verifies(doomedToken)).toBe(true);

    await retireKeys(db, { kid: doomedKid, force: true });
    expect(await kids()).toEqual([standby.id]);
    // Now, and only now, is the old token dead.
    expect(await verifies(doomedToken)).toBe(false);
  }, 60_000);

  /*
   * The tests below were added by a mutation audit (2026-09-27): each one pins
   * a line whose deletion or inversion left every test above green.
   */

  /**
   * `--force` is the only thing standing between `retire --kid` and every
   * token the key signed; without it a published key must be refused. The
   * compromise test above always passes `force`, so the refusal itself was
   * never exercised.
   */
  it("refuses to delete a key that is still published unless forced", async () => {
    const standby = await publishStandby(auth, db);
    try {
      await expect(retireKeys(db, { kid: standby.id })).rejects.toThrow(
        /still in the published key set/,
      );
      expect(await kids()).toContain(standby.id);
    } finally {
      await retireKeys(db, { kid: standby.id, force: true });
    }
  });

  /**
   * "Stopped signing" means every live key, not only the newest: a
   * `superseded` key has `expires_at = NULL` too. Left out of the promotion it
   * stays live and published for ever, and `retire` refuses it without
   * `--force` because it never leaves the published set.
   */
  it("stops every live key on promote, a superseded one included", async () => {
    const before = (await jwksStatus(db)).find((k) => k.state === "active");
    if (before === undefined) throw new Error("expected an active key");

    // A second live key, newer than the active one: the active one becomes
    // `superseded`. This is the state a hand-edit or an interrupted rotation
    // leaves behind.
    const newer = await publishStandby(auth, db);
    await db
      .update(jwksTable)
      .set({ expiresAt: null })
      .where(eq(jwksTable.id, newer.id));
    const live = await jwksStatus(db);
    expect(live.find((k) => k.id === before.id)?.state).toBe("superseded");
    expect(live.find((k) => k.id === newer.id)?.state).toBe("active");

    const incoming = await publishStandby(auth, db);
    const now = new Date();
    const result = await promoteStandby(db, { force: true, now });

    expect(result.promoted.id).toBe(incoming.id);
    expect(result.retiring.map((k) => k.id).toSorted()).toEqual(
      [before.id, newer.id].toSorted(),
    );
    const after = await jwksStatus(db);
    expect(after.filter((k) => k.state === "active").map((k) => k.id)).toEqual([
      incoming.id,
    ]);
    expect(after.some((k) => k.state === "superseded")).toBe(false);

    // What the CLI tells the operator: when the last token an outgoing key
    // signed stops verifying — which must come before that key leaves /jwks,
    // or the overlap this module exists for has a hole in it.
    expect(result.lastOldTokenExpiresAt).toEqual(
      new Date(
        now.getTime() +
          (TOKEN_TTL_SECONDS + API_CLOCK_TOLERANCE_SECONDS) * 1000,
      ),
    );
    for (const key of result.retiring) {
      expect(key.publishedUntil?.getTime()).toBeGreaterThan(
        result.lastOldTokenExpiresAt.getTime(),
      );
    }
  }, 60_000);

  /**
   * Two standbys is what two operators running `publish` at once produce —
   * each checks for a standby, finds none, and mints. Promoting one of them
   * silently would leave the other in the key set with nothing to promote it.
   */
  it("refuses to promote when two standbys exist", async () => {
    const first = await publishStandby(auth, db);
    // Hide the first from `publish`'s own guard, mint the second, restore.
    await db
      .update(jwksTable)
      .set({ expiresAt: new Date(first.createdAt.getTime() + 1000) })
      .where(eq(jwksTable.id, first.id));
    const second = await publishStandby(auth, db);
    await db
      .update(jwksTable)
      .set({ expiresAt: jwksTable.createdAt })
      .where(eq(jwksTable.id, first.id));
    try {
      await expect(promoteStandby(db, { force: true })).rejects.toThrow(
        /2 standby keys exist/,
      );
    } finally {
      await retireKeys(db, { kid: first.id, force: true });
      await retireKeys(db, { kid: second.id, force: true });
    }
  });

  /**
   * `jwksStatus` and better-auth's own `/jwks` filter must agree on when a
   * retired key stops being served, and they only do because `auth.ts` hands
   * better-auth the same `gracePeriod` this module computes with. Without it
   * better-auth falls back to thirty days, `retire` deletes rows `/jwks` still
   * serves, and `status` reports "NOT published" about a key that is.
   */
  it("stops serving a retired key exactly when it says it will", async () => {
    const key = await publishStandby(auth, db);
    const retiredAgo = async (seconds: number) => {
      await db
        .update(jwksTable)
        .set({ expiresAt: new Date(Date.now() - seconds * 1000) })
        .where(eq(jwksTable.id, key.id));
      return (await jwksStatus(db)).find((k) => k.id === key.id)?.state;
    };
    try {
      expect(await retiredAgo(JWKS_GRACE_PERIOD_SECONDS - 60)).toBe("retiring");
      expect(await kids()).toContain(key.id);

      expect(await retiredAgo(JWKS_GRACE_PERIOD_SECONDS + 60)).toBe(
        "unpublished",
      );
      expect(await kids()).not.toContain(key.id);
    } finally {
      await retireKeys(db, { kid: key.id, force: true });
    }
  });

  /**
   * The operator's only interface is `rotate-jwks.ts`, and its `promote` must
   * pass `--force` through as given — a CLI that always forced would skip the
   * soak and make every `services/api` with a warm cache reject every token
   * the new key signs. Run as a real process against this scratch database,
   * with `--force` as the positive control so a refusal cannot be mistaken
   * for the CLI simply failing to start.
   */
  it("rotate-jwks promote refuses during the soak unless --force is given", async () => {
    const standby = await publishStandby(auth, db);
    const cli = (...args: string[]) =>
      run(process.execPath, [CLI, ...args], {
        env: {
          ...process.env,
          AUTH_DATABASE_URL: url,
          BETTER_AUTH_SECRET: CLI_SECRET,
          BETTER_AUTH_URL: BASE,
          AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
        },
      }).then(
        ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
        (error: { code?: number; stdout?: string; stderr?: string }) => ({
          code: error.code ?? -1,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? "",
        }),
      );

    const refused = await cli("promote");
    expect(refused.stderr).toMatch(/has only been published/);
    expect(refused.code).toBe(1);
    expect((await jwksStatus(db)).find((k) => k.id === standby.id)?.state).toBe(
      "standby",
    );

    const forced = await cli("promote", "--force");
    expect(forced.stdout).toContain(`${standby.id} is now the signing key`);
    expect(forced.code).toBe(0);
    expect((await jwksStatus(db)).find((k) => k.id === standby.id)?.state).toBe(
      "active",
    );
  }, 60_000);

  /*
   * The tests below pin two windows in which the key set was briefly not what
   * the design says it is (review, 2026-09-27). Neither can be seen after the
   * fact by reading the table, so each is observed where it happens.
   */

  /**
   * "Published and trusted, before it signs anything" requires the row to be a
   * standby from the statement that creates it. `publish` used to insert
   * through better-auth's adapter — no `expires_at`, so live, and the newest —
   * then mark it standby with a second statement; a replica signing between
   * the two would have used a `kid` no verifier could know yet. An `AFTER
   * INSERT` trigger records the row exactly as that statement wrote it.
   */
  it("publishes a key that is a standby from the INSERT that creates it", async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(`
        CREATE TABLE jwks_insert_audit (id uuid, created_at timestamptz, expires_at timestamptz);
        CREATE FUNCTION jwks_insert_audit_fn() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            INSERT INTO jwks_insert_audit VALUES (NEW.id, NEW.created_at, NEW.expires_at);
            RETURN NEW;
          END $$;
        CREATE TRIGGER jwks_insert_audit AFTER INSERT ON jwks
          FOR EACH ROW EXECUTE FUNCTION jwks_insert_audit_fn();
      `);
      const standby = await publishStandby(auth, db);
      try {
        const { rows } = await client.query<{
          created_at: Date;
          expires_at: Date | null;
        }>(
          "SELECT created_at, expires_at FROM jwks_insert_audit WHERE id = $1",
          [standby.id],
        );
        expect(rows).toHaveLength(1);
        // Not null (live), and not merely soon: the standby mark itself.
        expect(rows[0]?.expires_at).not.toBeNull();
        expect(rows[0]?.expires_at?.getTime()).toBe(
          rows[0]?.created_at.getTime(),
        );
        expect(standby.state).toBe("standby");
      } finally {
        await retireKeys(db, { kid: standby.id, force: true });
      }
    } finally {
      await client.query(`
        DROP TRIGGER IF EXISTS jwks_insert_audit ON jwks;
        DROP FUNCTION IF EXISTS jwks_insert_audit_fn();
        DROP TABLE IF EXISTS jwks_insert_audit;
      `);
      await client.end();
    }
  });

  /**
   * A forced `retire` of the standby that lands between `promote` reading the
   * key set and running its transaction. The transaction used to stop the
   * outgoing key signing, match no standby row, and commit — no live key at
   * all, so better-auth mints an unpublished one inside the next sign — and
   * only then notice. It now checks inside the transaction and rolls back.
   */
  it("rolls back a promote whose standby a concurrent retire deleted — the old key keeps signing", async () => {
    const before = (await jwksStatus(db)).find((k) => k.state === "active");
    if (before === undefined) throw new Error("expected an active key");
    const standby = await publishStandby(auth, db);

    const racing = new Proxy(db, {
      get(target, prop) {
        if (prop === "transaction") {
          return async (...args: Parameters<AuthDb["transaction"]>) => {
            await retireKeys(db, { kid: standby.id, force: true });
            return target.transaction(...args);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await expect(promoteStandby(racing, { force: true })).rejects.toThrow(
      /gone or no longer a standby/,
    );
    const after = await jwksStatus(db);
    expect(after.find((k) => k.id === before.id)?.state).toBe("active");
    expect(after.filter((k) => k.state === "active")).toHaveLength(1);
    expect(decodeProtectedHeader(await mintToken()).kid).toBe(before.id);
  }, 60_000);

  /**
   * The same race the other way round: the retire read the key as a standby,
   * then waited while a promote made it the signing key. Deleting it now
   * would delete the only live key, so the delete is conditional on the state
   * the retire read.
   */
  it("deletes nothing when the standby it read has since been promoted", async () => {
    const standby = await publishStandby(auth, db);
    let promoted = false;
    const promoteFirst = <T extends object>(builder: T): T =>
      new Proxy(builder, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (prop === "then" && typeof value === "function") {
            return (...args: unknown[]) =>
              (async () => {
                if (!promoted) {
                  promoted = true;
                  await promoteStandby(db, { force: true });
                }
              })().then(() => value.apply(target, args));
          }
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            const out = value.apply(target, args);
            return typeof out === "object" && out !== null
              ? promoteFirst(out)
              : out;
          };
        },
      });
    const racing = new Proxy(db, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop === "delete" && typeof value === "function") {
          return (...args: unknown[]) =>
            promoteFirst(value.apply(target, args));
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await expect(
      retireKeys(racing, { kid: standby.id, force: true }),
    ).rejects.toThrow(/changed state since it was read/);
    const after = await jwksStatus(db);
    expect(after.find((k) => k.id === standby.id)?.state).toBe("active");
    expect(after.filter((k) => k.state === "active")).toHaveLength(1);
  }, 60_000);
});

/**
 * The counterfactual, measured rather than argued.
 *
 * The whole design turns on one claim about the verifier: a `services/api`
 * whose JWKS cache predates the incoming key **rejects every token that key
 * signs** while jose's cooldown is active. That is what `rotationInterval`
 * would do to us, and what the soak buys us out of. Reading
 * `jose/dist/webapi/jwks/remote.js` says so; this runs it.
 *
 * Both halves use a real `createRemoteJWKSet` over a real HTTP server serving
 * the real `/api/auth/jwks`, so the only thing that differs between them is how
 * stale the verifier's cache is allowed to get — which is exactly the variable
 * {@link STANDBY_SOAK_SECONDS} controls.
 */
describe("what a stale verifier does with a brand-new kid", () => {
  let auth: AuthInstance;
  let db: AuthDb;
  let close: () => Promise<void>;
  let server: Server;
  let jwksUrl: URL;

  const mintToken = async (): Promise<string> => {
    const signedIn = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: PASSWORD }),
      }),
    );
    const cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/token`, { headers: { cookie } }),
    );
    return ((await response.json()) as { token: string }).token;
  };

  beforeAll(async () => {
    const url = await resetScratchDatabase("auth_test_jwks_stale");
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, locale, disabled)
         VALUES ($1, 'test', 'test@test.com', true, now(), now(), 'user', 'en', false)`,
        [USER],
      );
      await client.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
        [USER, USER, await bcryptHash(PASSWORD, 10)],
      );
    } finally {
      await client.end();
    }
    const created = makeTestAuth(url);
    auth = created.auth;
    db = created.db;
    close = () => created.pool.end();

    // Serves the real key set over real HTTP, so jose fetches rather than
    // being handed a literal.
    server = createServer((_req, res) => {
      void auth
        .handler(new Request(`${BASE}/api/auth/jwks`))
        .then(async (r) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(await r.text());
        });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    jwksUrl = new URL(`http://127.0.0.1:${String(address.port)}/jwks`);
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    await close?.();
  });

  it("rejects it while cooling down, and accepts it once the cache has aged out", async () => {
    // `services/api`'s real settings.
    const cooled = createRemoteJWKSet(jwksUrl, {
      cacheMaxAge: API_JWKS_CACHE_MAX_AGE_SECONDS * 1000,
      cooldownDuration: 30 * 1000,
    });
    // The same verifier after the soak: its cache is older than cacheMaxAge, so
    // `fresh()` is false and it reloads *before* looking up the kid.
    const stale = createRemoteJWKSet(jwksUrl, {
      cacheMaxAge: 0,
      cooldownDuration: 30 * 1000,
    });

    // Warm both against the key set as it stands, with no rotation in sight.
    const before = await mintToken();
    await expect(jwtVerify(before, cooled)).resolves.toBeDefined();
    await expect(jwtVerify(before, stale)).resolves.toBeDefined();

    // Now a key appears and signs, with no gap between the two — which is what
    // `rotationInterval` does, and what `promote` without a soak would do.
    const standby = await publishStandby(auth, db);
    await promoteStandby(db, { force: true });
    const after = await mintToken();
    expect(decodeProtectedHeader(after).kid).toBe(standby.id);

    // THE HAZARD: the warm verifier has never seen this kid and refuses to go
    // and look, because it fetched moments ago.
    await expect(jwtVerify(after, cooled)).rejects.toThrow(
      /no applicable key found/i,
    );
    // THE REMEDY: a verifier whose cache has aged past cacheMaxAge reloads
    // first and verifies. Waiting STANDBY_SOAK_SECONDS puts every verifier in
    // this state before any token carries the new kid.
    await expect(jwtVerify(after, stale)).resolves.toBeDefined();

    // And throughout, the token signed by the outgoing key keeps working.
    await expect(jwtVerify(before, stale)).resolves.toBeDefined();
  }, 60_000);
});
