-- Rollback item_match_suggestions table changes

-- Drop the new table
DROP TRIGGER IF EXISTS update_item_match_suggestions_updated_at ON public.item_match_suggestions;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS public.item_match_suggestions CASCADE;

-- Recreate the original table structure (based on what we found in the database)
CREATE TABLE public.item_match_suggestions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    place_menu_item_id uuid NOT NULL,
    suggested_wine_id uuid,
    suggested_beer_id uuid,
    suggested_spirit_id uuid,
    suggested_coffee_id uuid,
    confidence_score numeric(3,2) NOT NULL,
    match_reasoning text,
    similarity_metrics jsonb,
    accepted boolean,
    rejected boolean,
    acted_by uuid,
    acted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT item_match_suggestions_pkey PRIMARY KEY (id),
    CONSTRAINT check_single_suggestion CHECK (num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id) = 1),
    -- Original foreign key constraints
    CONSTRAINT item_match_suggestions_acted_by_fkey FOREIGN KEY (acted_by) REFERENCES auth.users(id),
    CONSTRAINT item_match_suggestions_place_menu_item_id_fkey FOREIGN KEY (place_menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE CASCADE,
    CONSTRAINT item_match_suggestions_suggested_beer_id_fkey FOREIGN KEY (suggested_beer_id) REFERENCES public.beers(id),
    CONSTRAINT item_match_suggestions_suggested_coffee_id_fkey FOREIGN KEY (suggested_coffee_id) REFERENCES public.coffees(id),
    CONSTRAINT item_match_suggestions_suggested_spirit_id_fkey FOREIGN KEY (suggested_spirit_id) REFERENCES public.spirits(id),
    CONSTRAINT item_match_suggestions_suggested_wine_id_fkey FOREIGN KEY (suggested_wine_id) REFERENCES public.wines(id)
);

-- Recreate original indexes
CREATE INDEX idx_match_suggestions_pending ON public.item_match_suggestions(place_menu_item_id) 
WHERE accepted IS NULL AND rejected IS NULL;