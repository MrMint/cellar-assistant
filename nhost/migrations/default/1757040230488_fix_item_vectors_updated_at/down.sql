-- Rollback item_vectors table changes

-- Drop the trigger and function
DROP TRIGGER IF EXISTS update_item_vectors_updated_at ON public.item_vectors;
DROP FUNCTION IF EXISTS update_item_vectors_updated_at();

-- Remove the added column
ALTER TABLE public.item_vectors 
DROP COLUMN IF EXISTS updated_at;