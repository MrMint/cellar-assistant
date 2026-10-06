-- item_favorites is missing two of its six per-type unique constraints.
--
-- Found by B4 (2026-09-09) while implementing UserActor. The table has
--   item_favorites_user_id_{wine,beer,spirit,coffee}_id_key
-- but nothing for sake_id or tea_id -- the sake/tea item types were added later
-- and this constraint was not carried across (see the "adding an item type"
-- checklist, which lists exactly this class of omission).
--
-- Consequence if left alone: "idempotent on a unique constraint" is unavailable
-- for two of the six item types, so UserActor.favorite must fall back to a
-- turn-serialised read-then-write. That is safe only because every row it
-- touches has user_id = the actor key, and it is a weaker guarantee than the
-- other four types get. Fix the schema rather than carry the asymmetry forward.
--
-- This aborts rather than deduplicating. A duplicate favourite is meaningless
-- data, but it is still the user's, and silently deleting rows during a cutover
-- transform is exactly the kind of thing nobody notices until afterwards. If
-- E1's rehearsal against production data trips this, decide deliberately then.

DO $$
DECLARE
  dupes bigint;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM item_favorites
     WHERE sake_id IS NOT NULL GROUP BY user_id, sake_id HAVING count(*) > 1
    UNION ALL
    SELECT 1 FROM item_favorites
     WHERE tea_id IS NOT NULL GROUP BY user_id, tea_id HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'item_favorites holds % duplicate (user_id, sake_id/tea_id) group(s); '
      'resolve them deliberately before adding the unique constraints', dupes;
  END IF;
END $$;

-- `ADD CONSTRAINT` has no `IF NOT EXISTS` form, so the guard is explicit.
-- Found by E1's rehearsal: without this, resuming a part-finished cutover
-- (`scripts/cutover/cutover.sh all --from transform-a`) aborts here with
-- `relation "item_favorites_user_id_sake_id_key" already exists`, which
-- contradicts this lane's "applying a second time is a no-op" contract and
-- turns a resumable step into a restart-from-the-dump step.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.item_favorites'::regclass
       AND conname = 'item_favorites_user_id_sake_id_key'
  ) THEN
    ALTER TABLE item_favorites
      ADD CONSTRAINT item_favorites_user_id_sake_id_key UNIQUE (user_id, sake_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.item_favorites'::regclass
       AND conname = 'item_favorites_user_id_tea_id_key'
  ) THEN
    ALTER TABLE item_favorites
      ADD CONSTRAINT item_favorites_user_id_tea_id_key UNIQUE (user_id, tea_id);
  END IF;
END $$;
