-- Fix item_match_suggestions table to match Hasura metadata expectations

-- First, backup the existing data
CREATE TEMPORARY TABLE item_match_suggestions_backup AS 
SELECT * FROM public.item_match_suggestions;

-- Drop the existing table and recreate it with the expected schema
DROP TABLE public.item_match_suggestions CASCADE;

-- Create the new table matching the metadata expectations
CREATE TABLE public.item_match_suggestions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    beer_id uuid,
    coffee_id uuid,
    spirit_id uuid,
    wine_id uuid,
    confidence_score numeric(3,2) NOT NULL,
    suggestion_text text,
    is_processed boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT item_match_suggestions_pkey PRIMARY KEY (id),
    CONSTRAINT check_single_item_id CHECK (num_nonnulls(beer_id, coffee_id, spirit_id, wine_id) = 1),
    -- Foreign key constraints
    CONSTRAINT item_match_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT item_match_suggestions_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE CASCADE,
    CONSTRAINT item_match_suggestions_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON DELETE CASCADE,
    CONSTRAINT item_match_suggestions_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON DELETE CASCADE,
    CONSTRAINT item_match_suggestions_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_item_match_suggestions_user_id ON public.item_match_suggestions(user_id);
CREATE INDEX idx_item_match_suggestions_is_processed ON public.item_match_suggestions(is_processed) WHERE is_processed = false;

-- Create trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_item_match_suggestions_updated_at 
    BEFORE UPDATE ON public.item_match_suggestions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: Data migration would need to be customized based on business logic
-- since the table structure has changed significantly. For now, we're starting fresh.
-- If you have important data in the backup table, manual migration would be needed.