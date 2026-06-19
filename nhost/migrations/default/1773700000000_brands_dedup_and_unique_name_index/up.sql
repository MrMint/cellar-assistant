-- De-duplicate brands by lower(trim(name)) and add case-insensitive unique index
-- Safe to run when no duplicates exist (de-dup steps are no-ops then).

DO $$
DECLARE
  dup RECORD;
  canonical_id UUID;
BEGIN
  -- Iterate over each group of case-insensitively duplicate brand names
  FOR dup IN
    SELECT lower(trim(name)) AS norm_name
    FROM public.brands
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
  LOOP
    -- Pick the canonical row: earliest created_at, tie-break by id (smallest UUID string)
    SELECT id INTO canonical_id
    FROM public.brands
    WHERE lower(trim(name)) = dup.norm_name
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Repoint brands.parent_brand_id references to canonical
    UPDATE public.brands
    SET parent_brand_id = canonical_id
    WHERE parent_brand_id IN (
      SELECT id FROM public.brands
      WHERE lower(trim(name)) = dup.norm_name
        AND id <> canonical_id
    );

    -- Repoint item_brands.brand_id to canonical.
    -- item_brands has no unique constraint on (item_col, brand_id), so we just update.
    UPDATE public.item_brands
    SET brand_id = canonical_id
    WHERE brand_id IN (
      SELECT id FROM public.brands
      WHERE lower(trim(name)) = dup.norm_name
        AND id <> canonical_id
    );

    -- Repoint place_brands.brand_id to canonical.
    -- place_brands has UNIQUE(place_id, brand_id), so after updating we may create
    -- duplicate (place_id, canonical_id) pairs. Delete the would-be-duplicates first,
    -- keeping the row that already references the canonical id (if any), otherwise the
    -- earliest-created row among the duplicates.
    DELETE FROM public.place_brands
    WHERE brand_id IN (
      SELECT id FROM public.brands
      WHERE lower(trim(name)) = dup.norm_name
        AND id <> canonical_id
    )
    AND (place_id, canonical_id) IN (
      -- There is already a row for this place pointing at canonical — the update
      -- below would produce a unique violation, so delete the stale row now.
      SELECT place_id, canonical_id FROM public.place_brands
      WHERE brand_id = canonical_id
    );

    UPDATE public.place_brands
    SET brand_id = canonical_id
    WHERE brand_id IN (
      SELECT id FROM public.brands
      WHERE lower(trim(name)) = dup.norm_name
        AND id <> canonical_id
    );

    -- Delete the now-unreferenced duplicate brand rows
    DELETE FROM public.brands
    WHERE lower(trim(name)) = dup.norm_name
      AND id <> canonical_id;

  END LOOP;
END $$;

-- Add case-insensitive unique index so future duplicates raise a unique-violation error
CREATE UNIQUE INDEX brands_unique_lower_name ON public.brands (lower(name));
