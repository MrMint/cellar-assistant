-- Rollback item_image table changes

-- Drop the trigger and function
DROP TRIGGER IF EXISTS update_item_image_updated_at ON public.item_image;
DROP FUNCTION IF EXISTS update_item_image_updated_at();

-- Remove the added columns
ALTER TABLE public.item_image 
DROP COLUMN IF EXISTS created_at;

ALTER TABLE public.item_image 
DROP COLUMN IF EXISTS updated_at;