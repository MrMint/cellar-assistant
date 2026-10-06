-- 12 · Repoint B8's two `storage.files` foreign keys onto `public.files`.
--
-- A8's outcome note (migration plan §6, "The FK repoint is not A8's"): the
-- application columns still referencing `storage.files` are repointed by each
-- *consuming* actor's workstream. Two belong to B8:
--
--   menu_scans.original_image_id  -> MenuScanActor.create
--   menu_scans.processed_image_id -> MenuScanActor.create
--
-- B2 took its three in `09_item_file_fk_repoint.sql` and B5 took
-- `place_google_photos.storage_file_id` in `10_place_file_fk_repoint.sql`;
-- this mirrors both. With these two, no application table in `public`
-- references `storage.files` any more — E1 can drop the `storage` schema
-- without a dangling FK.
--
-- ORDERING FOR E1. Locally this is a no-op on empty tables. Against production
-- data it must run AFTER `services/actors/scripts/migrate-files.ts` has copied
-- `storage.files` into `files` (ids preserved — that is what makes the repoint
-- a metadata change rather than a data migration). The guard below aborts
-- rather than silently dropping a constraint whose rows would then be
-- unreferenced.
--
-- Re-runnable: a no-op once both FKs already point at `files`.

DO $$
DECLARE
  orphans bigint;
BEGIN
  SELECT count(*) INTO orphans
  FROM menu_scans m
  WHERE (m.original_image_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.files f WHERE f.id = m.original_image_id))
     OR (m.processed_image_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.files f WHERE f.id = m.processed_image_id));

  IF orphans > 0 THEN
    RAISE EXCEPTION
      '% menu scan(s) reference a file id missing from public.files; run '
      'services/actors/scripts/migrate-files.ts before this transform', orphans;
  END IF;
END $$;

ALTER TABLE menu_scans
  DROP CONSTRAINT IF EXISTS menu_scans_original_image_id_fkey;
ALTER TABLE menu_scans
  DROP CONSTRAINT IF EXISTS menu_scans_original_image_id_files_id_fkey;
ALTER TABLE menu_scans
  ADD CONSTRAINT menu_scans_original_image_id_files_id_fkey
  FOREIGN KEY (original_image_id) REFERENCES public.files(id);

ALTER TABLE menu_scans
  DROP CONSTRAINT IF EXISTS menu_scans_processed_image_id_fkey;
ALTER TABLE menu_scans
  DROP CONSTRAINT IF EXISTS menu_scans_processed_image_id_files_id_fkey;
ALTER TABLE menu_scans
  ADD CONSTRAINT menu_scans_processed_image_id_files_id_fkey
  FOREIGN KEY (processed_image_id) REFERENCES public.files(id);
