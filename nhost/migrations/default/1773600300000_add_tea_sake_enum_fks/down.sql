-- Rollback: remove enum FK constraints from teas and sakes tables.
-- Data that was NULLed out during up.sql cannot be recovered from this migration
-- (it would need to be restored from a backup or re-entered).

BEGIN;

-- TEAS
ALTER TABLE public.teas DROP CONSTRAINT IF EXISTS teas_category_fkey;
ALTER TABLE public.teas DROP CONSTRAINT IF EXISTS teas_form_fkey;
ALTER TABLE public.teas DROP CONSTRAINT IF EXISTS teas_caffeine_level_fkey;

-- SAKES
ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_category_fkey;
ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_type_fkey;
ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_serving_temperature_fkey;
ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_rice_variety_fkey;

COMMIT;
