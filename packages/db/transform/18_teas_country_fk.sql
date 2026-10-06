-- 18 · teas.country gets the foreign key the other five item types have.
--
-- Mirrors `packages/db/migrations/20260920005733_teas_country_fk`. Every
-- post-baseline migration needs a mirror here or the transform builds a
-- database that `tables.ts` no longer describes, and `cutover.sh`'s `baseline`
-- phase — a `drizzle-kit pull` diffed against `tables.ts` — dies on a non-empty
-- diff with the site already frozen. That is E4 decision 1's failure mode,
-- reached from the schema side instead of the index side.
--
-- ## What was wrong
--
-- `teas.country` was a bare `text()`; `beers`, `coffees`, `sakes`, `spirits`
-- and `wines` all carried `country -> country(value)`. Verified against the
-- live schema (2026-09-19), not inferred from the Drizzle file:
--
--   beers_country_country_value_fkey    FOREIGN KEY (country) REFERENCES country(value)
--   coffees_country_country_value_fkey  "
--   sakes_country_country_value_fkey    "
--   spirits_country_country_value_fkey  "
--   wines_country_country_value_fkey    "
--   teas                                -- nothing
--
-- `ItemActor` does no country validation of its own, so the constraint is the
-- only gate: `updateItem(type: TEA, country: "Freedonia")` was accepted where
-- the identical call on any other type was refused. Two modules already
-- describe the stronger behaviour as if it held —
-- `services/actors/src/lib/ai/vocabulary.ts`'s `countryOf("teas")` and the
-- client's `useReferenceOptions.ts`.
--
-- ## Why it validates rather than arriving NOT VALID
--
-- Because there is nothing to validate. Checked in all three databases that
-- exist in this worktree before writing this file:
--
--   legacy Nhost `local`            0 tea rows
--   per-worktree `cellar`           0 tea rows
--   shared `cellar-stack` `cellar`  104 tea rows, 0 with a non-null country
--
-- so in those databases no row can violate it and `ADD CONSTRAINT` takes its
-- lock, scans nothing and returns. A `NOT VALID` constraint would buy nothing
-- and leave behind a `VALIDATE` nobody would ever run.
--
-- ## Production is the one database that was not checked
--
-- This comment used to say that a source carrying tea countries would make
-- this statement fail "during the transform rather than at cutover". That is
-- not a distinction this file gets to make: `scripts/cutover/cutover.sh` runs
-- it in its `transform-c` phase, against the production dump, *during* the
-- freeze. `teas.country` was free text on Nhost, so one tea with a country
-- `country(value)` does not hold -- 'Japan' against the table's 'JAPAN' is
-- the likely shape; `11_drop_broken_sakes_country_default.sql` found exactly
-- that on sakes -- aborts `transform-c` with the site already down.
--
-- So the question is asked before the freeze instead:
-- `scripts/cutover/preflight.sql` section 4b lists every tea country with no
-- `country` row (and the case-insensitive match, if any), read-only, days
-- ahead. It must come back empty; a row there is a data decision -- map the
-- value, or null it -- made in daylight, not a schema change. If it is somehow
-- skipped, this statement still fails loudly rather than admitting the row;
-- it just fails at the worst possible time.
--
-- Re-runnable: the `IF NOT EXISTS` equivalent for constraints is the catalog
-- check below, because `ALTER TABLE ... ADD CONSTRAINT` has no such clause.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teas_country_country_value_fkey'
      AND conrelid = 'public.teas'::regclass
  ) THEN
    ALTER TABLE public.teas
      ADD CONSTRAINT teas_country_country_value_fkey
      FOREIGN KEY (country) REFERENCES public.country(value);
  END IF;
END
$$;
