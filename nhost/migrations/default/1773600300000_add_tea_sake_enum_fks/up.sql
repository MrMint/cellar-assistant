-- Migration: add_tea_sake_enum_fks
-- Adds foreign key constraints from teas/sakes columns to their respective
-- is_enum tables so that Hasura generates the *_enum GraphQL types needed
-- by dropdown UIs and AI onboarding categorical field resolution.
--
-- Data safety: normalize existing values to lowercase where possible, then
-- NULL out any remaining non-conforming values before adding the FK.

BEGIN;

-- ============================================================================
-- TEAS: category → tea_category(value)
-- ============================================================================

-- Normalize: lowercase any mismatched casing
UPDATE public.teas
SET category = lower(category)
WHERE category IS NOT NULL AND lower(category) != category;

-- NULL out values that still don't match an enum entry
UPDATE public.teas
SET category = NULL
WHERE category IS NOT NULL
  AND category NOT IN (SELECT value FROM public.tea_category);

-- Drop if exists (idempotent safety), then add FK
ALTER TABLE public.teas DROP CONSTRAINT IF EXISTS teas_category_fkey;
ALTER TABLE public.teas
  ADD CONSTRAINT teas_category_fkey
  FOREIGN KEY (category) REFERENCES public.tea_category(value);

-- ============================================================================
-- TEAS: form → tea_form(value)
-- ============================================================================

UPDATE public.teas
SET form = lower(form)
WHERE form IS NOT NULL AND lower(form) != form;

UPDATE public.teas
SET form = NULL
WHERE form IS NOT NULL
  AND form NOT IN (SELECT value FROM public.tea_form);

ALTER TABLE public.teas DROP CONSTRAINT IF EXISTS teas_form_fkey;
ALTER TABLE public.teas
  ADD CONSTRAINT teas_form_fkey
  FOREIGN KEY (form) REFERENCES public.tea_form(value);

-- ============================================================================
-- TEAS: caffeine_level → tea_caffeine_level(value)
-- ============================================================================

UPDATE public.teas
SET caffeine_level = lower(caffeine_level)
WHERE caffeine_level IS NOT NULL AND lower(caffeine_level) != caffeine_level;

UPDATE public.teas
SET caffeine_level = NULL
WHERE caffeine_level IS NOT NULL
  AND caffeine_level NOT IN (SELECT value FROM public.tea_caffeine_level);

ALTER TABLE public.teas DROP CONSTRAINT IF EXISTS teas_caffeine_level_fkey;
ALTER TABLE public.teas
  ADD CONSTRAINT teas_caffeine_level_fkey
  FOREIGN KEY (caffeine_level) REFERENCES public.tea_caffeine_level(value);

-- ============================================================================
-- SAKES: category → sake_category(value)
-- ============================================================================

UPDATE public.sakes
SET category = lower(category)
WHERE category IS NOT NULL AND lower(category) != category;

UPDATE public.sakes
SET category = NULL
WHERE category IS NOT NULL
  AND category NOT IN (SELECT value FROM public.sake_category);

ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_category_fkey;
ALTER TABLE public.sakes
  ADD CONSTRAINT sakes_category_fkey
  FOREIGN KEY (category) REFERENCES public.sake_category(value);

-- ============================================================================
-- SAKES: type → sake_type(value)
-- NOTE: sakes.type column confirmed to exist (inspected via \d public.sakes)
-- ============================================================================

UPDATE public.sakes
SET type = lower(type)
WHERE type IS NOT NULL AND lower(type) != type;

UPDATE public.sakes
SET type = NULL
WHERE type IS NOT NULL
  AND type NOT IN (SELECT value FROM public.sake_type);

ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_type_fkey;
ALTER TABLE public.sakes
  ADD CONSTRAINT sakes_type_fkey
  FOREIGN KEY (type) REFERENCES public.sake_type(value);

-- ============================================================================
-- SAKES: serving_temperature → sake_serving_temperature(value)
-- ============================================================================

UPDATE public.sakes
SET serving_temperature = lower(serving_temperature)
WHERE serving_temperature IS NOT NULL AND lower(serving_temperature) != serving_temperature;

UPDATE public.sakes
SET serving_temperature = NULL
WHERE serving_temperature IS NOT NULL
  AND serving_temperature NOT IN (SELECT value FROM public.sake_serving_temperature);

ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_serving_temperature_fkey;
ALTER TABLE public.sakes
  ADD CONSTRAINT sakes_serving_temperature_fkey
  FOREIGN KEY (serving_temperature) REFERENCES public.sake_serving_temperature(value);

-- ============================================================================
-- SAKES: rice_variety → sake_rice_variety(value)
-- ============================================================================

UPDATE public.sakes
SET rice_variety = lower(rice_variety)
WHERE rice_variety IS NOT NULL AND lower(rice_variety) != rice_variety;

UPDATE public.sakes
SET rice_variety = NULL
WHERE rice_variety IS NOT NULL
  AND rice_variety NOT IN (SELECT value FROM public.sake_rice_variety);

ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_rice_variety_fkey;
ALTER TABLE public.sakes
  ADD CONSTRAINT sakes_rice_variety_fkey
  FOREIGN KEY (rice_variety) REFERENCES public.sake_rice_variety(value);

COMMIT;
