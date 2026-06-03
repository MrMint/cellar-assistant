-- =====================================
-- Tea Tables Migration - UP
-- Adds tea as a new item type with comprehensive schema
-- =====================================

-- Create main teas table
CREATE TABLE teas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Tea-specific fields
    -- Note: Producer information handled via item_brands table
    category TEXT,                          -- black/green/white/oolong/pu-erh/herbal/rooibos/mate/chai/blend
    form TEXT,                              -- loose_leaf/sachet/tea_bag/matcha_powder/brick/instant
    caffeine_level TEXT,                    -- high/medium/low/decaf/none
    region TEXT,                            -- Origin region (e.g., Darjeeling, Uji, Wuyi)
    country TEXT,
    cultivar TEXT,                          -- Varietal / botanical (e.g., Camellia sinensis sinensis, assamica)
    oxidation_level TEXT,                   -- none/light/partial/full/post_fermented
    processing TEXT,                        -- steamed/pan_fired/roasted/aged/smoked
    harvest_year INTEGER,                   -- Year of harvest/production
    ingredients TEXT,                       -- For blends and herbal tisanes
    steeping_temperature TEXT,              -- Recommended steeping temperature
    steeping_time TEXT,                     -- Recommended steeping duration
    flavor_profile TEXT,                    -- Tasting notes and flavor descriptors
    is_organic BOOLEAN,
    is_fair_trade BOOLEAN,

    -- Standard item fields
    barcode_code TEXT REFERENCES barcodes(code),
    item_onboarding_id UUID
);

-- Add indexes for performance
CREATE INDEX idx_teas_created_by ON teas(created_by_id);
CREATE INDEX idx_teas_name ON teas(name);
CREATE INDEX idx_teas_category ON teas(category);
CREATE INDEX idx_teas_region ON teas(region);

-- Add comments for documentation
COMMENT ON TABLE teas IS 'Tea items with detailed characteristics including category, origin, processing details, and brewing guidance';
COMMENT ON COLUMN teas.category IS 'Tea category (e.g., black, green, white, oolong, pu-erh, herbal, rooibos, mate, chai, blend)';
COMMENT ON COLUMN teas.form IS 'Physical form of the tea (e.g., loose_leaf, sachet, tea_bag, matcha_powder, brick, instant)';
COMMENT ON COLUMN teas.caffeine_level IS 'Caffeine content level (high, medium, low, decaf, none)';
COMMENT ON COLUMN teas.region IS 'Region or estate of origin (e.g., Darjeeling, Uji, Wuyi, Assam)';
COMMENT ON COLUMN teas.cultivar IS 'Tea cultivar or botanical variety (e.g., Camellia sinensis sinensis, assamica, or herbal botanical name)';
COMMENT ON COLUMN teas.oxidation_level IS 'Degree of oxidation (none, light, partial, full, post_fermented)';
COMMENT ON COLUMN teas.processing IS 'Processing method (e.g., steamed, pan_fired, roasted, aged, smoked)';
COMMENT ON COLUMN teas.harvest_year IS 'Year of harvest or production';
COMMENT ON COLUMN teas.ingredients IS 'Ingredient list for blends and herbal tisanes';
COMMENT ON COLUMN teas.steeping_temperature IS 'Recommended steeping temperature';
COMMENT ON COLUMN teas.steeping_time IS 'Recommended steeping duration';
COMMENT ON COLUMN teas.flavor_profile IS 'Tasting notes and flavor descriptors';
COMMENT ON COLUMN teas.is_organic IS 'Whether the tea is certified organic';
COMMENT ON COLUMN teas.is_fair_trade IS 'Whether the tea is certified fair trade';

-- Create tea category enum table
CREATE TABLE tea_category (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO tea_category (value, comment) VALUES
('black', 'Fully oxidized tea - bold, robust flavors'),
('green', 'Unoxidized tea - grassy, fresh, vegetal notes'),
('white', 'Minimally processed tea - delicate, subtle flavors'),
('oolong', 'Partially oxidized tea - complex flavor spectrum between green and black'),
('pu_erh', 'Post-fermented aged tea - earthy, complex, often aged for years'),
('yellow', 'Lightly oxidized tea - mellow, smooth with slight oxidation'),
('dark', 'Post-fermented tea including hei cha varieties'),
('herbal', 'Herbal tisane - caffeine-free infusions from plants other than Camellia sinensis'),
('rooibos', 'South African red bush tea - naturally caffeine-free, sweet and earthy'),
('mate', 'South American yerba mate - high caffeine, grassy and smoky'),
('chai', 'Spiced tea blend - typically black tea with warming spices'),
('blend', 'Blended tea - combination of multiple tea types or flavors');

-- Create tea form enum table
CREATE TABLE tea_form (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO tea_form (value, comment) VALUES
('loose_leaf', 'Loose leaf tea - whole or broken leaves for superior flavor'),
('sachet', 'Pyramid or envelope sachet - whole leaf in a larger bag'),
('tea_bag', 'Traditional flat tea bag - convenient, often fannings or dust'),
('matcha_powder', 'Finely ground green tea powder - used for matcha drinks'),
('brick', 'Compressed tea brick or cake - traditional form for pu-erh and dark teas'),
('instant', 'Instant soluble tea powder or granules');

-- Create tea caffeine level enum table
CREATE TABLE tea_caffeine_level (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO tea_caffeine_level (value, comment) VALUES
('high', 'High caffeine content - comparable to coffee (e.g., black tea, matcha)'),
('medium', 'Moderate caffeine content (e.g., oolong, some green teas)'),
('low', 'Low caffeine content (e.g., white tea, some herbal blends)'),
('decaf', 'Decaffeinated tea - caffeine removed through processing'),
('none', 'Naturally caffeine-free (e.g., rooibos, most herbal tisanes)');

-- Add comments to document as Hasura enum tables
COMMENT ON TABLE tea_category IS 'Hasura enum table for tea category values - major classification system';
COMMENT ON TABLE tea_form IS 'Hasura enum table for tea form values - physical presentation types';
COMMENT ON TABLE tea_caffeine_level IS 'Hasura enum table for tea caffeine level values - caffeine content classifications';

-- Add tea to item_type enum table
INSERT INTO item_type (value, comment) VALUES ('TEA', 'Tea - loose-leaf, bagged teas and herbal tisanes');

-- Add tea_id column to cellar_items table
ALTER TABLE cellar_items ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_cellar_items_tea_id ON cellar_items(tea_id);

-- Add tea_id to item_vectors table for search functionality
ALTER TABLE item_vectors ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_item_vectors_tea_id ON item_vectors(tea_id);

-- Add tea_id to item_image table for photo associations
ALTER TABLE item_image ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_item_image_tea_id ON item_image(tea_id);

-- Add tea_id to item_favorites table for user favorites
ALTER TABLE item_favorites ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_item_favorites_tea_id ON item_favorites(tea_id);

-- Add tea_id to item_reviews table for user reviews
ALTER TABLE item_reviews ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_item_reviews_tea_id ON item_reviews(tea_id);

-- Add suggested_tea_id to item_match_suggestions for menu scan matching
ALTER TABLE item_match_suggestions ADD COLUMN suggested_tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_item_match_suggestions_suggested_tea_id ON item_match_suggestions(suggested_tea_id);

-- Add tea_id to item_brands table for producer relationships
ALTER TABLE item_brands ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_item_brands_tea_id ON item_brands(tea_id);

-- Update item_brands constraint to include tea_id
ALTER TABLE item_brands DROP CONSTRAINT IF EXISTS exactly_one_item_reference;
ALTER TABLE item_brands ADD CONSTRAINT exactly_one_item_reference
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1);

-- Add tea_id to recipe_ingredients table for recipe usage
ALTER TABLE recipe_ingredients ADD COLUMN tea_id UUID REFERENCES teas(id);
CREATE INDEX idx_recipe_ingredients_tea_id ON recipe_ingredients(tea_id);

-- Update recipe_ingredients constraint to include tea_id
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS exactly_one_item_reference;
ALTER TABLE recipe_ingredients ADD CONSTRAINT exactly_one_item_reference
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id, generic_item_id) = 1);

-- Update check_single_suggested_item constraint in item_match_suggestions to include suggested_tea_id
ALTER TABLE item_match_suggestions DROP CONSTRAINT IF EXISTS check_single_suggested_item;
ALTER TABLE item_match_suggestions ADD CONSTRAINT check_single_suggested_item
    CHECK (num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id, suggested_sake_id, suggested_tea_id, suggested_recipe_id) = 1);

-- Create updated_at trigger for teas table
CREATE TRIGGER set_updated_at_teas
    BEFORE UPDATE ON teas
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- Update cellar_items constraint to include tea_id
ALTER TABLE cellar_items DROP CONSTRAINT IF EXISTS "Ensure exactly one item Id";
ALTER TABLE cellar_items ADD CONSTRAINT "Ensure exactly one item Id"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1);

-- Update type generation to include tea
ALTER TABLE cellar_items DROP COLUMN IF EXISTS type;
ALTER TABLE cellar_items ADD COLUMN type TEXT GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        WHEN sake_id IS NOT NULL THEN 'SAKE'::text
        WHEN tea_id IS NOT NULL THEN 'TEA'::text
        ELSE 'SPIRIT'::text
    END
) STORED;

-- Verify all constraints are properly added
DO $$
BEGIN
    -- Check that tea was added to item_type
    IF NOT EXISTS (SELECT 1 FROM item_type WHERE value = 'TEA') THEN
        RAISE EXCEPTION 'Failed to add tea to item_type enum';
    END IF;

    -- Check that main teas table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teas') THEN
        RAISE EXCEPTION 'Failed to create teas table';
    END IF;

    -- Check that enum tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tea_category') THEN
        RAISE EXCEPTION 'Failed to create tea_category table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tea_form') THEN
        RAISE EXCEPTION 'Failed to create tea_form table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tea_caffeine_level') THEN
        RAISE EXCEPTION 'Failed to create tea_caffeine_level table';
    END IF;

    RAISE NOTICE 'Tea tables migration completed successfully';
END $$;
