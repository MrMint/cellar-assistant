-- Add missing columns to item_image table to match Hasura metadata expectations

-- Add created_at column
ALTER TABLE public.item_image 
ADD COLUMN created_at timestamp with time zone DEFAULT now();

-- Add updated_at column  
ALTER TABLE public.item_image 
ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- Update existing rows to have current timestamp for created_at and updated_at
UPDATE public.item_image 
SET created_at = now(), updated_at = now() 
WHERE created_at IS NULL OR updated_at IS NULL;

-- Create trigger to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_item_image_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_item_image_updated_at 
    BEFORE UPDATE ON public.item_image 
    FOR EACH ROW EXECUTE FUNCTION update_item_image_updated_at();