-- Disabling a user ends their sessions (W4 security review F8).
--
-- `"user".disabled` was enforced in exactly one place: better-auth's
-- `databaseHooks.session.create.before` (`services/actors/src/auth/auth.ts`),
-- which refuses a *new* session. A session that already existed kept working
-- for the rest of its seven days — `/api/auth/token` went on minting 15-minute
-- JWTs from it, and `services/api` never looks at `disabled`, because the token
-- is the whole credential there. hasura-auth refused a disabled user's refresh,
-- so this was a regression, not a gap carried over.
--
-- Nothing in the application disables a user: there is no admin mutation for
-- it, and the operational path is an `UPDATE "user" SET disabled = true`. So
-- the rule lives where that path lands. The trigger deletes the user's
-- `session` rows in the same transaction that flips the column; the next
-- `/token` or `/get-session` finds no row and answers 401 / `null`, and the
-- client's own session-ended handling takes it from there.
--
-- `services/actors/src/auth/auth.ts` also refuses a disabled user at token
-- mint (`definePayload`) and at session refresh (`session.update.before`).
-- Those hold if a session row survives this trigger — a restore run with
-- `session_replication_role = replica`, say — and this holds if a session is
-- ever read by something other than better-auth.
--
-- Only the false -> true edge fires it. Re-enabling deletes nothing (there is
-- nothing to delete), and an UPDATE that rewrites `disabled` to its current
-- value is not a disable.
CREATE OR REPLACE FUNCTION public.end_sessions_of_disabled_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.session WHERE user_id = NEW.id;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS user_disabled_ends_sessions ON public."user";
--> statement-breakpoint
CREATE TRIGGER user_disabled_ends_sessions
  AFTER UPDATE OF disabled ON public."user"
  FOR EACH ROW
  WHEN (NEW.disabled AND OLD.disabled IS DISTINCT FROM NEW.disabled)
  EXECUTE FUNCTION public.end_sessions_of_disabled_user();
--> statement-breakpoint
-- Users disabled before this migration: their sessions end now, the way they
-- would have if the trigger had existed when they were disabled. At cutover
-- this runs after the transform, which copies no sessions, so it deletes
-- nothing there; on a database that has been serving, it is the backfill.
DELETE FROM public.session s
 USING public."user" u
 WHERE s.user_id = u.id
   AND u.disabled;
