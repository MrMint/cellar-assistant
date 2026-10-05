-- 10 · Repoint B5's `storage.files` foreign key onto `public.files`.
--
-- A8's outcome note (migration plan §6, "The FK repoint is not A8's"): the six
-- application columns still referencing `storage.files` are repointed by each
-- *consuming* actor's workstream. Exactly one belongs to B5:
--
--   place_google_photos.storage_file_id -> PlaceActor.enrichFromGoogle
--
-- `menu_scans.original_image_id` / `.processed_image_id` are B8's and are
-- deliberately left alone; B2 took its three in `09_item_file_fk_repoint.sql`,
-- whose header this mirrors.
--
-- ORDERING FOR E1. Locally this is a no-op on empty tables. Against production
-- data it must run AFTER `services/actors/scripts/migrate-files.ts` has copied
-- `storage.files` into `files` (ids preserved — that is what makes the repoint
-- a metadata change rather than a data migration). The guard below aborts
-- rather than silently dropping a constraint whose rows would then be
-- unreferenced.
--
-- Re-runnable: a no-op once the FK already points at `files`.

DO $$
DECLARE
  orphans bigint;
BEGIN
  SELECT count(*) INTO orphans
  FROM place_google_photos p
  WHERE p.storage_file_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.files f WHERE f.id = p.storage_file_id);

  IF orphans > 0 THEN
    RAISE EXCEPTION
      '% referenced file id(s) are missing from public.files; run '
      'services/actors/scripts/migrate-files.ts before this transform', orphans;
  END IF;
END $$;

ALTER TABLE place_google_photos
  DROP CONSTRAINT IF EXISTS place_google_photos_storage_file_id_fkey;
ALTER TABLE place_google_photos
  DROP CONSTRAINT IF EXISTS place_google_photos_storage_file_id_files_id_fkey;
ALTER TABLE place_google_photos
  ADD CONSTRAINT place_google_photos_storage_file_id_files_id_fkey
  FOREIGN KEY (storage_file_id) REFERENCES public.files(id);
