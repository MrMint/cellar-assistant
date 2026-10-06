-- 09 · Repoint B2's three `storage.files` foreign keys onto `public.files`.
--
-- A8's outcome note (migration plan §6, "The FK repoint is not A8's"): the six
-- application columns still referencing `storage.files` are repointed by each
-- *consuming* actor's workstream. Three of them belong to B2:
--
--   item_image.file_id                   -> ItemActor.attachImage
--   item_onboardings.front_label_image_id -> ItemOnboardingActor.start
--   item_onboardings.back_label_image_id  -> ItemOnboardingActor.start
--
-- The remaining three are not B2's and are deliberately left alone:
-- `menu_scans.original_image_id` / `.processed_image_id` (B8) and
-- `place_google_photos.storage_file_id` (B5). `storage.virus.file_id` is
-- Nhost's own and is dropped with the schema at cutover.
--
-- ORDERING FOR E1. Locally this is a no-op on empty tables. Against production
-- data it must run AFTER `services/actors/scripts/migrate-files.ts` has copied
-- `storage.files` into `files` (ids preserved — that is what makes the
-- repoint a metadata change rather than a data migration). The guard below
-- aborts rather than silently dropping a constraint whose rows would then be
-- unreferenced.
--
-- Re-runnable: each block is a no-op once the FK already points at `files`.

DO $$
DECLARE
  orphans bigint;
BEGIN
  SELECT count(*) INTO orphans FROM (
    SELECT file_id AS id FROM item_image
    UNION ALL
    SELECT front_label_image_id FROM item_onboardings
     WHERE front_label_image_id IS NOT NULL
    UNION ALL
    SELECT back_label_image_id FROM item_onboardings
     WHERE back_label_image_id IS NOT NULL
  ) referenced
  WHERE NOT EXISTS (SELECT 1 FROM public.files f WHERE f.id = referenced.id);

  IF orphans > 0 THEN
    RAISE EXCEPTION
      '% referenced file id(s) are missing from public.files; run '
      'services/actors/scripts/migrate-files.ts before this transform', orphans;
  END IF;
END $$;

ALTER TABLE item_image
  DROP CONSTRAINT IF EXISTS item_image_file_id_files_id_fkey;
ALTER TABLE item_image
  ADD CONSTRAINT item_image_file_id_files_id_fkey
  FOREIGN KEY (file_id) REFERENCES public.files(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE item_onboardings
  DROP CONSTRAINT IF EXISTS item_onboardings_front_label_image_id_files_id_fkey;
ALTER TABLE item_onboardings
  ADD CONSTRAINT item_onboardings_front_label_image_id_files_id_fkey
  FOREIGN KEY (front_label_image_id) REFERENCES public.files(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE item_onboardings
  DROP CONSTRAINT IF EXISTS item_onboardings_back_label_image_id_files_id_fkey;
ALTER TABLE item_onboardings
  ADD CONSTRAINT item_onboardings_back_label_image_id_files_id_fkey
  FOREIGN KEY (back_label_image_id) REFERENCES public.files(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;
