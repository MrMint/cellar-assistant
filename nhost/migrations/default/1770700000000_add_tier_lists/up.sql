-- Create tier_lists table
CREATE TABLE IF NOT EXISTS public.tier_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by_id UUID NOT NULL REFERENCES auth.users(id),
    privacy TEXT NOT NULL DEFAULT 'PRIVATE' REFERENCES permission_type(value),
    list_type TEXT NOT NULL DEFAULT 'place',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for tier_lists
CREATE INDEX IF NOT EXISTS tier_lists_created_by_id_idx ON public.tier_lists(created_by_id);
CREATE INDEX IF NOT EXISTS tier_lists_privacy_idx ON public.tier_lists(privacy);

-- Add updated_at trigger for tier_lists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_public_tier_lists_updated_at'
    ) THEN
        CREATE TRIGGER set_public_tier_lists_updated_at
        BEFORE UPDATE ON public.tier_lists
        FOR EACH ROW
        EXECUTE FUNCTION public.set_current_timestamp_updated_at();
    END IF;
END $$;

-- Create tier_list_items table
CREATE TABLE IF NOT EXISTS public.tier_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_list_id UUID NOT NULL REFERENCES tier_lists(id) ON DELETE CASCADE,
    band INTEGER NOT NULL DEFAULT 0 CHECK (band >= 0 AND band <= 5),
    position INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    place_id UUID REFERENCES places(id),
    wine_id UUID REFERENCES wines(id),
    beer_id UUID REFERENCES beers(id),
    spirit_id UUID REFERENCES spirits(id),
    coffee_id UUID REFERENCES coffees(id),
    sake_id UUID REFERENCES sakes(id),
    type TEXT GENERATED ALWAYS AS (
        CASE
            WHEN place_id IS NOT NULL THEN 'PLACE'
            WHEN beer_id IS NOT NULL THEN 'BEER'
            WHEN wine_id IS NOT NULL THEN 'WINE'
            WHEN coffee_id IS NOT NULL THEN 'COFFEE'
            WHEN sake_id IS NOT NULL THEN 'SAKE'
            WHEN spirit_id IS NOT NULL THEN 'SPIRIT'
        END
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT exactly_one_tier_item_reference
        CHECK (num_nonnulls(place_id, wine_id, beer_id, spirit_id, coffee_id, sake_id) = 1),
    CONSTRAINT unique_place_in_tier_list UNIQUE (tier_list_id, place_id),
    CONSTRAINT unique_wine_in_tier_list UNIQUE (tier_list_id, wine_id),
    CONSTRAINT unique_beer_in_tier_list UNIQUE (tier_list_id, beer_id),
    CONSTRAINT unique_spirit_in_tier_list UNIQUE (tier_list_id, spirit_id),
    CONSTRAINT unique_coffee_in_tier_list UNIQUE (tier_list_id, coffee_id),
    CONSTRAINT unique_sake_in_tier_list UNIQUE (tier_list_id, sake_id)
);

-- Create indexes for tier_list_items
CREATE INDEX IF NOT EXISTS tier_list_items_tier_list_id_idx ON public.tier_list_items(tier_list_id);
CREATE INDEX IF NOT EXISTS tier_list_items_place_id_idx ON public.tier_list_items(place_id);
CREATE INDEX IF NOT EXISTS tier_list_items_tier_list_id_band_position_idx ON public.tier_list_items(tier_list_id, band DESC, position ASC);

-- Add updated_at trigger for tier_list_items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_public_tier_list_items_updated_at'
    ) THEN
        CREATE TRIGGER set_public_tier_list_items_updated_at
        BEFORE UPDATE ON public.tier_list_items
        FOR EACH ROW
        EXECUTE FUNCTION public.set_current_timestamp_updated_at();
    END IF;
END $$;
