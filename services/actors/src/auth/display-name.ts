/**
 * A display name is public; an email address is not (W4 security review F2).
 *
 * `displayName` is returned by `user(id)` and matched by `userSearch` for any
 * signed-in viewer, while `email` comes back `null` to everyone but its owner.
 * Sign-up used to default the name to the email when the field was left blank
 * (`SignUpApiClient.tsx`, and `authClient.signUp.email` behind it), and
 * hasura-auth did the same, so `userSearch(term: "@")` listed the address of
 * every user who never chose a name. The concealment was only as good as the
 * one field nobody thought of as containing an email.
 *
 * So a name that is empty, or that contains anything shaped like an address,
 * is never stored:
 *
 *   - on **create** (email sign-up, and OAuth sign-up, where the provider's
 *     name may be absent) it is replaced by a neutral handle;
 *   - on **update** through better-auth's own `/update-user` it is refused;
 *   - rows that already hold one are rewritten by the migration
 *     `…_display_names_are_not_emails`, whose SQL pattern is
 *     {@link EMAIL_SHAPED_SQL} — `display-name.test.ts` holds the two to the
 *     same answers.
 *
 * **A neutral handle, not the address's local part.** The local part is the
 * half of an address that is hard to guess: `jane.doe` plus the three domains
 * most accounts use is most of a harvest again. `member-3f9a2c` identifies
 * nobody and is replaced the moment its owner picks a name (Edit profile).
 *
 * `UserActor.updateProfile` writes the same column through
 * `lib/profile-store.ts`, outside better-auth; it has to apply
 * {@link isEmailShaped} too.
 */
import { randomBytes } from "node:crypto";

/**
 * Something `@` something `.` something, anywhere in the string, with no
 * whitespace inside it — `jane@example.com`, `Jane <jane@example.com>`.
 * `@jane` (a handle) and `a@b` (no dot) are not addresses and pass.
 */
const EMAIL_SHAPED = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * {@link EMAIL_SHAPED} in Postgres's ARE dialect, for the backfill migration.
 * `[:space:]` is `\s`; the migration spells the same pattern.
 */
export const EMAIL_SHAPED_SQL =
  "[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+";

export const isEmailShaped = (name: string): boolean => EMAIL_SHAPED.test(name);

/** `member-` and six hex characters. Not unique, and it need not be. */
export const neutralHandle = (): string =>
  `member-${randomBytes(3).toString("hex")}`;

/**
 * The name a new user row is stored with: theirs, trimmed, unless it is empty
 * or email-shaped, in which case a {@link neutralHandle}.
 */
export const displayNameForNewUser = (name: unknown): string => {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed === "" || isEmailShaped(trimmed) ? neutralHandle() : trimmed;
};

/**
 * The handle a user row that *already exists* is given: `member-` and the
 * first six hex digits of its own id. Deterministic, unlike
 * {@link neutralHandle}, so re-importing or re-running the backfill never
 * renames anyone twice. The backfill migration computes exactly this in SQL
 * (`'member-' || substr(replace(id::text, '-', ''), 1, 6)`).
 */
export const handleForId = (id: string): string =>
  `member-${id.replaceAll("-", "").slice(0, 6).toLowerCase()}`;

/**
 * The name an existing account keeps, by the backfill migration's three
 * cases: its own address (ignoring case and surrounding space), empty, or
 * containing an email-shaped string all become {@link handleForId}; anything
 * else is kept as it is.
 *
 * `scripts/migrate-users.ts` applies it to every row it imports. The
 * migration covers the cutover order (users are imported, then `db:migrate`
 * runs), but the ledger applies a migration once — an import run *after* it,
 * a rehearsal re-run with `--update-existing` for one, would otherwise put
 * hasura-auth's email default straight back.
 */
export const displayNameForExistingUser = (row: {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}): string =>
  row.name.trim().toLowerCase() === row.email.trim().toLowerCase() ||
  row.name.trim() === "" ||
  isEmailShaped(row.name)
    ? handleForId(row.id)
    : row.name;

/**
 * Why an update's `name` is refused, or `null` when it may be stored. `name`
 * absent from the update is not a name change and always passes.
 */
export const displayNameUpdateRefusal = (name: unknown): string | null => {
  if (name === undefined) return null;
  if (typeof name !== "string" || name.trim() === "") {
    return "display name must not be empty";
  }
  if (isEmailShaped(name)) {
    return "display name must not be an email address: it is shown to other users, and your email is not";
  }
  return null;
};
