/**
 * Password hashing for A6.
 *
 * Nhost's `hasura-auth` stores bcrypt (`$2a$10$…`, 60 chars). better-auth's
 * default is scrypt. A migrated user must be able to sign in with the password
 * they already have, without a reset — so `verify` recognises a bcrypt hash and
 * checks it with bcrypt, and falls through to better-auth's own verifier for
 * everything else.
 *
 * `hash` is *not* overridden: every new or re-hashed password is written with
 * better-auth's scrypt. bcrypt is a read path only.
 */
import { compare as bcryptCompare } from "bcryptjs";
import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Modular-crypt bcrypt: `$2` + optional variant letter + `$` + two-digit cost +
 * `$` + 53 chars of base64 salt/digest. Anchored and length-checked so a scrypt
 * hash can never be mistaken for one.
 */
const BCRYPT_HASH = /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const isBcryptHash = (hash: string): boolean => BCRYPT_HASH.test(hash);

export type RehashFn = (args: {
  bcryptHash: string;
  newHash: string;
}) => Promise<void>;

export type PasswordOptions = {
  /**
   * Called after a bcrypt password verifies, to replace that exact hash with a
   * scrypt one. Best-effort: see `createPassword` for why a failure here can
   * never lock anyone out. Omit to disable transparent re-hashing.
   */
  rehash?: RehashFn | undefined;
  /** Injected in tests. */
  logger?: Pick<Console, "warn"> | undefined;
};

/**
 * Builds the `emailAndPassword.password` implementation.
 *
 * Transparent re-hash (decision recorded in `./README.md`): when a bcrypt hash
 * verifies we *additionally* write a scrypt hash for the same secret. It is
 * awaited — so the upgrade has landed by the time the caller continues, and
 * two sign-ins in a row cannot both do the work — but it cannot change the
 * outcome:
 *
 *   1. The verdict is computed from bcrypt alone, before the upgrade is
 *      attempted, and is returned unmodified. Sign-in cannot fail because of
 *      the upgrade.
 *   2. The update is `WHERE password = <the exact bcrypt hash>`. bcrypt hashes
 *      are salted, so that string identifies one row; no user id is needed and
 *      no other row can be touched.
 *   3. Any error is swallowed and logged. The row keeps its bcrypt hash and the
 *      next sign-in takes the identical bcrypt path — the failure mode is
 *      "tried again next time", never "locked out".
 *   4. Concurrent sign-ins race harmlessly: the loser's UPDATE matches 0 rows
 *      because the hash it is keyed on is already gone.
 */
export const createPassword = (options: PasswordOptions = {}) => {
  const logger = options.logger ?? console;

  return {
    hash: (password: string): Promise<string> => hashPassword(password),

    verify: async ({
      hash,
      password,
    }: {
      hash: string;
      password: string;
    }): Promise<boolean> => {
      if (!isBcryptHash(hash)) {
        return verifyPassword({ hash, password });
      }

      const ok = await bcryptCompare(password, hash);
      if (!ok) return false;

      const rehash = options.rehash;
      if (rehash !== undefined) {
        try {
          const newHash = await hashPassword(password);
          await rehash({ bcryptHash: hash, newHash });
        } catch (error) {
          // Step 3 above: the user is already signed in at this point.
          logger.warn(
            "[auth] bcrypt→scrypt re-hash failed; the row keeps its bcrypt hash",
            error,
          );
        }
      }

      return ok;
    },
  };
};
