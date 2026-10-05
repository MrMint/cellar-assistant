-- 05 · `place_menu_items.menu_item_price`: `money` -> `numeric(10,2)`.
--
-- This is a deliberate bug fix, not a mechanical port. Postgres `money` formats
-- and rounds according to the server's `lc_monetary`, so the same row reads back
-- differently on a differently-configured server and the stored value carries no
-- currency of its own. It is the wrong type for a stored price. `money` is also
-- one of the four types drizzle-kit can only represent as an untyped
-- `customType` placeholder (findings §Q4), so fixing it here removes a
-- hand-written wrapper the schema would otherwise need forever.
--
-- E1: this runs against production data. The cast goes through `numeric`
-- directly, which is exact for every value `money` can hold, but it reads the
-- stored value under the server's *current* `lc_monetary`. Confirm production's
-- `lc_monetary` is `en_US.UTF-8`/`C` (i.e. two decimal places, `.` separator)
-- before the real run, and spot-check a handful of prices afterwards.
--
-- Re-runnable: the guard skips the ALTER once the column is already numeric.

DO $$
DECLARE
  current_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO current_type
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.place_menu_items')
      AND a.attname = 'menu_item_price'
      AND NOT a.attisdropped;

  IF current_type IS NULL THEN
    RAISE EXCEPTION 'public.place_menu_items.menu_item_price does not exist';
  END IF;

  IF current_type = 'money' THEN
    RAISE NOTICE 'lc_monetary during money -> numeric conversion: %',
      current_setting('lc_monetary');
    ALTER TABLE public.place_menu_items
      ALTER COLUMN menu_item_price TYPE numeric(10, 2)
      USING menu_item_price::numeric;
  END IF;
END $$;
