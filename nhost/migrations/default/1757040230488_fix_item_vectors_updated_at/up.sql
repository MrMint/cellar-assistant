-- Add missing updated_at column to item_vectors table to match Hasura metadata expectations

-- Add updated_at column  
ALTER TABLE public.item_vectors 
ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- Update existing rows to have current timestamp for updated_at
UPDATE public.item_vectors 
SET updated_at = now() 
WHERE updated_at IS NULL;

-- Create trigger to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_item_vectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_item_vectors_updated_at 
    BEFORE UPDATE ON public.item_vectors 
    FOR EACH ROW EXECUTE FUNCTION update_item_vectors_updated_at();