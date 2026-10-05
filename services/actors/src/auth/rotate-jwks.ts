/**
 * The operator entry point for JWKS rotation. See `./jwks-rotation.ts` for the
 * design; this file is argument parsing and printing.
 *
 * Run it against the same environment the actor host runs with — it reads
 * `AUTH_DATABASE_URL` and `BETTER_AUTH_SECRET` through `readAuthConfig()`,
 * because minting a key means encrypting its private half under that secret:
 *
 *     # per-worktree lane: `bun run dev:env` prints the variables
 *     node services/actors/src/auth/rotate-jwks.ts status
 *
 *     # shared lane, inside the container that already has the environment;
 *     # its working directory is /workspace/services/actors (Dockerfile
 *     # WORKDIR, compose working_dir) — there is no /app in either image
 *     docker exec cellar-stack-actors-1 node src/auth/rotate-jwks.ts status
 *
 * A normal rotation is three commands and a wait:
 *
 *     rotate-jwks publish    # mint a standby; it is at /jwks immediately
 *     …wait 15 minutes…     # `status` says when
 *     rotate-jwks promote    # the standby starts signing; nobody is logged out
 *     …wait 30 minutes…     # the old key verifies out its grace period
 *     rotate-jwks retire     # delete rows /jwks no longer serves
 *
 * Node 24 is required (`.nvmrc`); this is a `.ts` file run directly, so it
 * relies on native type stripping.
 */
import { createAuth } from "./auth.ts";
import { readAuthConfig } from "./config.ts";
import {
  type ClassifiedJwk,
  JWKS_GRACE_PERIOD_SECONDS,
  jwksStatus,
  promoteStandby,
  publishStandby,
  retireKeys,
  STANDBY_SOAK_SECONDS,
  TOKEN_TTL_SECONDS,
} from "./jwks-rotation.ts";

const USAGE = `rotate-jwks <command>

  status                 what each key is, and whether promote is safe now
  publish                mint a standby key: published at /jwks, signs nothing
  promote [--force]      the standby starts signing; the old key keeps verifying
  retire [--kid <id>] [--force]
                         delete key rows /jwks no longer serves

Windows (services/actors/src/auth/jwks-rotation.ts):
  token lifetime   ${String(TOKEN_TTL_SECONDS)}s
  standby soak     ${String(STANDBY_SOAK_SECONDS)}s before a standby may sign
  grace period     ${String(JWKS_GRACE_PERIOD_SECONDS)}s of verifying after it stops signing
`;

const describe = (key: ClassifiedJwk, now: Date): string => {
  const age = Math.floor((now.getTime() - key.createdAt.getTime()) / 1000);
  const published =
    key.publishedUntil === null
      ? "published"
      : key.publishedUntil.getTime() > now.getTime()
        ? `published until ${key.publishedUntil.toISOString()}`
        : "NOT published";
  return `  ${key.id}  ${key.state.padEnd(11)} created ${key.createdAt.toISOString()} (${String(age)}s ago), ${published}`;
};

const printStatus = (keys: ClassifiedJwk[], now: Date): void => {
  if (keys.length === 0) {
    console.log(
      "No keys. better-auth mints one on the first token or /jwks request.",
    );
    return;
  }
  console.log(`${String(keys.length)} key(s) at ${now.toISOString()}:`);
  for (const key of keys) console.log(describe(key, now));

  const standby = keys.find((key) => key.state === "standby");
  if (standby === undefined) {
    console.log("\nNo rotation in progress. `publish` starts one.");
    return;
  }
  const from = standby.promotableFrom as Date;
  const until = standby.promotableUntil as Date;
  if (from.getTime() > now.getTime()) {
    const wait = Math.ceil((from.getTime() - now.getTime()) / 1000);
    console.log(
      `\nStandby ${standby.id} is soaking. ` +
        `\`promote\` is safe from ${from.toISOString()} (${String(wait)}s away) ` +
        `until ${until.toISOString()}.`,
    );
  } else if (until.getTime() <= now.getTime()) {
    console.log(
      `\nStandby ${standby.id} aged out of /jwks at ${until.toISOString()}. ` +
        "Run `publish` again.",
    );
  } else {
    const left = Math.floor((until.getTime() - now.getTime()) / 1000);
    console.log(
      `\nStandby ${standby.id} is ready. Run \`promote\` within ${String(left)}s ` +
        `(by ${until.toISOString()}).`,
    );
  }
};

const flag = (argv: readonly string[], name: string): boolean =>
  argv.includes(`--${name}`);

const value = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) {
    throw new Error(`--${name} needs a value`);
  }
  return next;
};

const main = async (argv: readonly string[]): Promise<number> => {
  const command = argv[0];
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(USAGE);
    return command === undefined ? 1 : 0;
  }

  const { auth, pool, db } = createAuth(readAuthConfig());
  const now = new Date();
  try {
    switch (command) {
      case "status": {
        printStatus(await jwksStatus(db, now), now);
        return 0;
      }
      case "publish": {
        // No injected clock: a mint stamps `created_at` itself, and the
        // standby mark is read back against a fresh one. See publishStandby.
        const standby = await publishStandby(auth, db);
        const from = standby.promotableFrom as Date;
        console.log(
          `Published standby ${standby.id}.\n` +
            "It is served at /api/auth/jwks now and signs nothing.\n" +
            `Promote from ${from.toISOString()} ` +
            `(${String(STANDBY_SOAK_SECONDS)}s from now), and before ` +
            `${(standby.promotableUntil as Date).toISOString()}.`,
        );
        return 0;
      }
      case "promote": {
        const result = await promoteStandby(db, {
          force: flag(argv, "force"),
          now,
        });
        console.log(
          `${result.promoted.id} is now the signing key.\n` +
            `Stopped signing: ${
              result.retiring.map((key) => key.id).join(", ") || "(none)"
            }\n` +
            "Those keys keep verifying until " +
            `${result.retiring[0]?.publishedUntil?.toISOString() ?? "n/a"}; ` +
            "the last token they signed expires at " +
            `${result.lastOldTokenExpiresAt.toISOString()}.\n` +
            "No restart is needed — the signing key is read from the table on " +
            "every sign. Run `retire` once the grace period has passed.",
        );
        return 0;
      }
      case "retire": {
        const deleted = await retireKeys(db, {
          kid: value(argv, "kid"),
          force: flag(argv, "force"),
          now,
        });
        console.log(
          deleted.length === 0
            ? "Nothing to retire: every key is still in the published set."
            : `Deleted ${String(deleted.length)} key(s): ${deleted
                .map((key) => `${key.id} (${key.state})`)
                .join(", ")}`,
        );
        return 0;
      }
      default: {
        console.error(`unknown command ${JSON.stringify(command)}\n\n${USAGE}`);
        return 1;
      }
    }
  } finally {
    await pool.end();
  }
};

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
