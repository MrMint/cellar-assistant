-- Hand-written SQL lane (migration-plan.md §8.6): align
-- outbox_dead_letter_acks's foreign key to Drizzle's own naming convention —
-- the same treatment transform/07_align_constraint_names.sql gives every
-- other single-column foreign key in this schema, arriving separately
-- because `07` runs too early to see this one.
--
-- `07` runs in the numbered transform range (00-08), which is entirely
-- finished before `packages/db/migrations/20260920164500_outbox_dead_letter_acks`
-- ever creates this table (the hand-written lane applies last, after every
-- numbered file including `17_target_indexes.sql`). So `07`'s generic
-- "rename every foreign key to Drizzle's convention" scan never sees this
-- table's constraint, and it is left at Postgres's own default for an
-- unnamed single-column FK: `outbox_dead_letter_acks_outbox_id_fkey` — one
-- segment shorter than Drizzle's convention, which repeats the foreign
-- column (`<table>_<col>_<foreign table>_<foreign col>_fkey`).
--
-- Why this matters: `packages/db/src/schema/tables.ts` declares this FK with
-- the plain `.references()` form (not a named `foreignKey()` builder),
-- because that is the only form `drizzle-kit pull` ever renders for a
-- single-column FK — the same limitation `07`'s own header comment
-- describes. A bare `.references()` call has no explicit name, so Drizzle
-- derives one on its own: `outbox_dead_letter_acks_outbox_id_outbox_id_fkey`.
-- Without this rename, the live database's constraint name would never
-- match what `drizzle-kit generate` derives from that declaration — the
-- exact drift `07` exists to prevent, just on a table it runs too early to
-- reach. Verified via `drizzle-kit generate` against the corrected
-- `tables.ts`: it proposes exactly this name.
--
-- Idempotent: renames only if the old (unaligned) name is still there.

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_dead_letter_acks_outbox_id_fkey'
      AND conrelid = 'public.outbox_dead_letter_acks'::regclass
  ) THEN
    ALTER TABLE public.outbox_dead_letter_acks
      RENAME CONSTRAINT outbox_dead_letter_acks_outbox_id_fkey
          TO outbox_dead_letter_acks_outbox_id_outbox_id_fkey;
  END IF;
END $$;
