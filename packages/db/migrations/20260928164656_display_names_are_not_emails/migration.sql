-- A display name is public; an email address is not (W4 security review F2).
--
-- `"user".name` is every user's display name. `user(id)` and `userSearch`
-- return it to any signed-in viewer and `userSearch` matches on it, while
-- `email` is returned to its owner only. hasura-auth defaulted `display_name`
-- to the email address, `migrate-users.ts` carries `display_name` across
-- verbatim, and the new sign-up form did the same until this change — so
-- `userSearch(term: "@")` listed the address of everyone who never chose a
-- name.
--
-- New rows are held to the rule by better-auth's `user.create.before` hook
-- (`services/actors/src/auth/display-name.ts`). This rewrites the rows that
-- already break it, with the same neutral handle that hook gives: `member-`
-- and six hex characters, here taken from the row's own id so a re-run is a
-- no-op rather than a second rename. A rewritten user keeps their account and
-- everything in it; they pick a new name under Edit profile.
--
-- Three cases, and the third is why this is not simply `name = email`:
--
--   1. the name is the account's own address, ignoring case and surrounding
--      space — hasura-auth's default, and this app's until now;
--   2. the name is empty — hasura-auth's column default was `''`, and an empty
--      name is not something the app lets anyone choose;
--   3. the name *contains* anything email-shaped — somebody else's address, or
--      "Jane <jane@example.com>". `EMAIL_SHAPED_SQL` in `display-name.ts` is
--      this same pattern, and `display-name.test.ts` runs both over the same
--      cases.
--
-- Runs under `db:migrate`, which at cutover is after `migrate-users.ts` (the
-- `users` phase precedes `migrate` in `scripts/cutover/cutover.sh`), so the
-- migrated rows are the ones it sees. Measured before writing this
-- (2026-09-28, counts only): cellar-stack's `cellar` 2 users, both case 1;
-- the local Nhost `auth.users` 2 users, both case 1.
UPDATE public."user"
   SET name = 'member-' || substr(replace(id::text, '-', ''), 1, 6),
       updated_at = now()
 WHERE lower(btrim(name)) = lower(btrim(email))
    OR btrim(name) = ''
    OR name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+';
