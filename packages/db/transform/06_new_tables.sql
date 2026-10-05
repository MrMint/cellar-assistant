-- 06 · The three tables the new stack adds: `files`, `jobs`, `outbox`.
--
-- First cut only. A5 owns `outbox`/`jobs` and A8 owns `files`; each may add
-- columns. What is here is the column set those workstreams' acceptance criteria
-- name, so that the Drizzle baseline is not empty where they need it.
--
-- Re-runnable. Creates nothing that already exists; destroys nothing.

-- `files` replaces `storage.files` (§3). Deliberately NOT wired up yet:
--   * the six application FKs still point at `storage.files`. A8 migrates the
--     rows and repoints them, keeping object keys unchanged.
--   * `uploaded_by` has no FK. There is no user table to point at until A6 lands
--     better-auth; `auth.users` is being retired, so pointing at it would create
--     a constraint A6 immediately has to drop.
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL DEFAULT 'cellar-files',
  key text NOT NULL,
  size integer,
  mime_type text,
  etag text,
  uploaded_by uuid,
  -- NULL until the browser's PUT to the presigned URL is confirmed by
  -- `FileActor.verify`. The orphan reaper deletes unverified rows after 24h.
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS files_bucket_key_idx
  ON public.files (bucket, key);

CREATE INDEX IF NOT EXISTS files_unverified_idx
  ON public.files (created_at)
  WHERE verified_at IS NULL;

-- `jobs` replaces both `place_refresh_jobs` and `onboarding_reprocess_jobs`
-- (dropped in 03). One table behind the `JobActor` base class.
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  -- Opaque to the base class; each JobActor subclass defines its own shape.
  cursor jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  total integer,
  processed integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT jobs_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS jobs_kind_status_idx ON public.jobs (kind, status);

-- `outbox` is the only durability primitive for side effects (§1.4). An actor
-- inserts into it inside its own transaction; `OutboxActor` drains it.
--
-- `seq` is what makes §1.4's "drains rows in order" true (A7b). `id` is a random
-- v4 uuid and `created_at` is transaction-*start* time, so two rows written by
-- one transaction tie on both and their relative order was arbitrary. A
-- `bigserial` is assigned at INSERT, so it is total and insertion-ordered even
-- within a transaction. It is NOT the primary key: `id` is the outbox row's
-- identity, it travels as the idempotency key (`ctx.requestId = "outbox:<id>"`,
-- §8.4), and nothing outside this table's own ORDER BY ever reads `seq`.
CREATE TABLE IF NOT EXISTS public.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL,
  target_actor text NOT NULL,
  target_id text NOT NULL,
  method text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  attributed_to uuid,
  CONSTRAINT outbox_status_check CHECK (
    status IN ('pending', 'delivering', 'delivered', 'dead')
  )
);

-- The claim token (finding B). A `delivering` row carries the identity of the
-- claim it is under, so the deliverer holding that claim is the only one whose
-- outcome write matches — a host that stalled past `RECLAIM_AFTER` and returns
-- after the reclaim sweep has re-delivered the row writes nothing at all,
-- rather than resurrecting a `delivered` row and overwriting the reclaim's
-- attempt charge from its own stale snapshot. Null except while `delivering`.
--
-- A uuid rather than reusing `updated_at`: the token has to be unique per
-- claim, and two claims can share a timestamp.
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS claim_token uuid;

-- Attribution for model spend. Mirrors
-- `packages/db/migrations/20260927215215_budget_attribution_and_reservation_index`.
-- An outbox delivery runs as `systemCtx`, which has no viewer, so a model call
-- made inside one used to write `api_usage_log.triggered_by = NULL` — 63 of 93
-- embedding rows and 13 of 13 menu-extraction rows on the compose stack
-- (2026-09-27), which blinds the budget runbook's "who is looping" query. The
-- enqueuing viewer is recorded here and `BudgetActor.reserveForModel` copies it
-- into `triggered_by`. **Attribution only**: the delivery ctx is unchanged and
-- no policy or authority check reads this column. No foreign key, like
-- `api_usage_log.triggered_by`: deleting a user must not block or cascade into
-- the queue. Null for work the system originated.
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS attributed_to uuid;

-- A7b, for a database created before `seq` existed. `bigserial` in ALTER TABLE
-- creates the sequence, the default and the NOT NULL; existing rows are
-- numbered in whatever order Postgres rewrites them, which is the best that can
-- be said about rows whose order was never recorded in the first place.
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS seq bigserial NOT NULL;

-- The drain query: oldest due pending rows first, then insertion order. Both
-- columns are in the index so the claim is an ordered index scan with no sort.
-- Dropped rather than `CREATE INDEX IF NOT EXISTS`ed, because a database built
-- before A7b already has this name on a one-column index.
DROP INDEX IF EXISTS public.outbox_due_idx;
CREATE INDEX outbox_due_idx
  ON public.outbox (run_after, seq)
  WHERE status = 'pending';
