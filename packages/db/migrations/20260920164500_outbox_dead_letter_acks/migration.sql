-- Hand-written SQL lane (migration-plan.md §8.6): the dead-letter
-- acknowledgement ledger.
--
-- `MaintenanceActor.reportDeadLetters` is the system's only outbox alarm, and
-- the outbox reaper deliberately never deletes a `status = 'dead'` row, because
-- the row is the evidence. Those two facts together made the alarm re-report
-- the same resolved failures every hour, forever. Measured 2026-09-20: 23 dead
-- rows, every one of them predating the fix that closed its own cause, and so
-- 100% false positive.
--
-- This table is how the alarm tells **new** from **already seen** without
-- deleting anything. It is an append-only annotation *beside* `outbox`, not a
-- mutation of it: the evidence stays byte-identical and the triage decision
-- gets its own row, with its own author and its own reason.
--
-- ## Why the key is one outbox row, not one (target_actor, method) pair
--
-- A pair-level mute ("I have seen MenuScanActor.process fail") is the obvious
-- design and it is the wrong one: the next genuine failure of that pair would
-- be suppressed by a decision taken about earlier, unrelated rows. A fixed bug
-- regressing is the single most valuable thing this alarm can say, and a
-- pair-level mute silences precisely that.
--
-- Keyed on `outbox.id`, suppression cannot over-apply. An acknowledgement names
-- rows that already exist and already died; a regression produces a *new* row
-- with a new id, which no prior acknowledgement can have named. The alarm fires
-- on it by construction rather than by a rule someone has to remember.
--
-- `target_actor` / `method` are copied in rather than joined out, so the
-- regression question — does this pair have acknowledged rows *and*
-- unacknowledged ones? — is one grouped scan of the two tables, and so that a
-- purge of `outbox` is the only thing that can erase the fact that a pair was
-- once triaged.
--
-- `ON DELETE CASCADE`, not `RESTRICT`: nothing in this system deletes a dead
-- row, so the cascade only ever fires when a human deliberately destroys the
-- evidence. The annotation about a row that no longer exists is not evidence of
-- anything, and a pair whose acknowledged rows were purged correctly reads as
-- new again rather than as a regression.
--
-- ## Why it is in the hand-written lane instead of the Drizzle schema
--
-- `packages/db/src/` is another agent's in this worktree, so this table is not
-- in `src/schema/tables.ts` and has no `TABLE_WRITERS` entry yet. The lane is
-- the mechanism that keeps an unmodelled object reproducible: `run.sh` applies
-- every migration carrying the marker above to both the development database
-- and `cellar_test_template`, and `test-db.sh` hashes them into the template
-- fingerprint, so adding this file rebuilds the template by itself.
--
-- That is a real gap, not a hiding place, and it is worth naming: the
-- containment half of the single-writer test only records a raw-SQL write whose
-- table is in `KNOWN_TABLES` (`packages/db/src/writers-scan.ts`), so writes to
-- this table are invisible to it until a `drizzle-kit pull` picks the table up.
-- **Owed follow-up:** pull it into `src/schema/tables.ts` and give it the
-- `infrastructure:outbox` writer — it is infrastructure for exactly the same
-- reason `outbox` is, and once it is there the coverage half
-- (`satisfies Record<TableName, Writer>`) refuses to typecheck without it.
--
-- Idempotent throughout: `run.sh` applies the lane on every build, and this
-- file is also what an operator runs by hand against a live database.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.outbox_dead_letter_acks (
  outbox_id       uuid        PRIMARY KEY
                              REFERENCES public.outbox(id) ON DELETE CASCADE,
  target_actor    text        NOT NULL,
  method          text        NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  -- Free text on purpose: an operator handle, a ticket, a rollout name. An
  -- acknowledgement with no author is a rumour, so the column is NOT NULL and
  -- `MaintenanceActor.acknowledgeDeadLetters` rejects an empty one.
  acknowledged_by text        NOT NULL,
  note            text
);

--> statement-breakpoint

-- The regression query groups by pair; the primary key answers "is this row
-- acknowledged?" and this index answers "has this pair ever been?".
CREATE INDEX IF NOT EXISTS outbox_dead_letter_acks_pair_idx
  ON public.outbox_dead_letter_acks (target_actor, method);
