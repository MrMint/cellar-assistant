-- =====================================
-- Sake Tables Migration - UP
-- Adds sake as a new item type with comprehensive schema
-- =====================================

-- Create main sakes table
CREATE TABLE sakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Sake-specific fields
    -- Note: Brewery information handled via item_brands table with brand_type='brewery'
    region TEXT,                          -- Prefecture/region (e.g., Niigata, Kyoto)
    category TEXT,                        -- Junmai, Honjozo, etc.
    type TEXT,                           -- Dry, sweet, fruity, etc.
    polish_grade DECIMAL(4,2),           -- Rice polishing ratio (e.g., 50.00 for 50%)
    alcohol_content_percentage DECIMAL(4,2),
    serving_temperature TEXT,            -- Chilled, room temp, warmed
    rice_variety TEXT,                   -- Yamadanishiki, Gohyakumangoku, etc.
    yeast_strain TEXT,                   -- Kyokai yeast strains
    sake_meter_value DECIMAL(4,2),       -- SMV (nihonshudo) indicating dryness/sweetness
    acidity DECIMAL(4,2),                -- Acidity level
    amino_acid DECIMAL(4,2),             -- Amino acid content
    vintage INTEGER,                      -- Year of production
    country TEXT DEFAULT 'Japan',

    -- Standard item fields
    barcode_code TEXT REFERENCES barcodes(code),
    item_onboarding_id UUID
);

-- Add indexes for performance
CREATE INDEX idx_sakes_created_by ON sakes(created_by_id);
CREATE INDEX idx_sakes_name ON sakes(name);
CREATE INDEX idx_sakes_region ON sakes(region);
CREATE INDEX idx_sakes_category ON sakes(category);
CREATE INDEX idx_sakes_type ON sakes(type);
CREATE INDEX idx_sakes_polish_grade ON sakes(polish_grade);
CREATE INDEX idx_sakes_vintage ON sakes(vintage);

-- Add comments for documentation
COMMENT ON TABLE sakes IS 'Sake items with detailed characteristics including classification, production details, and tasting notes';
COMMENT ON COLUMN sakes.polish_grade IS 'Rice polishing ratio as percentage (e.g., 50.00 for 50% - lower numbers indicate higher quality)';
COMMENT ON COLUMN sakes.sake_meter_value IS 'Sake Meter Value (nihonshudo) indicating dryness/sweetness - positive values are drier, negative values are sweeter';
COMMENT ON COLUMN sakes.acidity IS 'Acidity level affecting taste balance and sharpness';
COMMENT ON COLUMN sakes.amino_acid IS 'Amino acid content affecting umami and body';
COMMENT ON COLUMN sakes.region IS 'Prefecture or region of production (e.g., Niigata, Kyoto, Hiroshima)';
COMMENT ON COLUMN sakes.rice_variety IS 'Rice variety used for brewing (e.g., Yamadanishiki, Gohyakumangoku)';
COMMENT ON COLUMN sakes.yeast_strain IS 'Yeast strain used for fermentation (e.g., Kyokai #9, Kyokai #7)';

-- Create sake categories enum table (major classifications)
CREATE TABLE sake_category (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO sake_category (value, comment) VALUES
('junmai', 'Pure rice sake with no added alcohol'),
('honjozo', 'Premium sake with small amount of distilled alcohol added'),
('ginjo', 'Premium sake with rice polished to 60% or less'),
('daiginjo', 'Super premium sake with rice polished to 50% or less'),
('junmai_ginjo', 'Pure rice ginjo sake - no added alcohol'),
('junmai_daiginjo', 'Pure rice daiginjo sake - highest quality pure rice'),
('tokubetsu_junmai', 'Special pure rice sake with unique characteristics'),
('tokubetsu_honjozo', 'Special honjozo sake with enhanced quality'),
('futsushu', 'Regular sake - most common type'),
('namazake', 'Unpasteurized sake - fresh and vibrant'),
('nigorizake', 'Cloudy/unfiltered sake - rustic and rich'),
('koshu', 'Aged sake - developed complex flavors'),
('genshu', 'Undiluted sake - full strength'),
('taruzake', 'Cedar cask sake - woody aromatics');

-- Create sake types enum table (sub-classifications/flavor profiles)
CREATE TABLE sake_type (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO sake_type (value, comment) VALUES
('dry', 'Karakuchi - dry sake with clean finish'),
('sweet', 'Amakuchi - sweet sake with residual sugars'),
('medium_dry', 'Medium dry sake - balanced with slight dryness'),
('medium_sweet', 'Medium sweet sake - balanced with subtle sweetness'),
('light', 'Tanrei - light and clean, delicate flavor'),
('rich', 'Nōjun - rich and full-bodied, complex flavors'),
('fruity', 'Fruity aromatics with floral and fruit notes'),
('earthy', 'Earthy and mineral notes from terroir'),
('floral', 'Floral aromatics with elegant bouquet'),
('umami', 'Savory and umami-rich with deep flavors');

-- Create sake serving temperatures enum table
CREATE TABLE sake_serving_temperature (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO sake_serving_temperature (value, comment) VALUES
('tobikiri_kan', 'Very hot (55°C/131°F) - intense warming'),
('atsu_kan', 'Hot (50°C/122°F) - traditional hot serving'),
('jo_kan', 'Warm (45°C/113°F) - gently warmed'),
('nuru_kan', 'Body temperature (40°C/104°F) - barely warm'),
('hitohada_kan', 'Skin temperature (35°C/95°F) - slightly warm'),
('room_temperature', 'Room temperature (20°C/68°F) - natural serving'),
('hiya', 'Cool/cellar temperature (10°C/50°F) - lightly chilled'),
('rei_shu', 'Chilled (5°C/41°F) - properly chilled'),
('yuki_hie', 'Snow cold (0°C/32°F) - very cold serving');

-- Create rice varieties enum table for sake
CREATE TABLE sake_rice_variety (
    value TEXT PRIMARY KEY,
    comment TEXT
);

INSERT INTO sake_rice_variety (value, comment) VALUES
('yamadanishiki', 'King of sake rice - premium quality from Hyogo'),
('gohyakumangoku', 'Popular Niigata variety - clean and crisp'),
('miyamanishiki', 'Cold-climate variety from mountain regions'),
('omachi', 'Heirloom variety from Okayama - rich and complex'),
('hattan_nishiki', 'Hiroshima variety - elegant and refined'),
('dewasansan', 'Yamagata variety - fruity and aromatic'),
('ginpu', 'Hokkaido variety - clean and light'),
('akita_sake_komachi', 'Akita variety - regional specialty'),
('kamenoo', 'Historic variety - traditional character'),
('aizan', 'Sweet, fruity variety - premium quality'),
('yumesansui', 'Aichi variety - modern development'),
('wakamizu', 'Fukuoka variety - southern region specialty');

-- Add comments to document as Hasura enum tables
COMMENT ON TABLE sake_category IS 'Hasura enum table for sake category values - major classification system';
COMMENT ON TABLE sake_type IS 'Hasura enum table for sake type values - flavor profiles and characteristics';
COMMENT ON TABLE sake_serving_temperature IS 'Hasura enum table for sake serving temperature values - traditional temperature classifications';
COMMENT ON TABLE sake_rice_variety IS 'Hasura enum table for sake rice variety values - rice cultivars used in brewing';

-- Add sake to item_type enum table
INSERT INTO item_type (value, comment) VALUES ('SAKE', 'Japanese rice wine - traditional fermented beverage');

-- Add sake_id column to cellar_items table
ALTER TABLE cellar_items ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_cellar_items_sake_id ON cellar_items(sake_id);

-- Add sake_id to item_vectors table for search functionality
ALTER TABLE item_vectors ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_item_vectors_sake_id ON item_vectors(sake_id);

-- Add sake_id to item_image table for photo associations
ALTER TABLE item_image ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_item_image_sake_id ON item_image(sake_id);

-- Add sake_id to item_favorites table for user favorites
ALTER TABLE item_favorites ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_item_favorites_sake_id ON item_favorites(sake_id);

-- Add sake_id to item_reviews table for user reviews
ALTER TABLE item_reviews ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_item_reviews_sake_id ON item_reviews(sake_id);

-- Add sake_id to item_match_suggestions table for AI matching
ALTER TABLE item_match_suggestions ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_item_match_suggestions_sake_id ON item_match_suggestions(sake_id);

-- Add sake_id to item_brands table for brewery relationships
ALTER TABLE item_brands ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_item_brands_sake_id ON item_brands(sake_id);

-- Update item_brands constraint to include sake_id
ALTER TABLE item_brands DROP CONSTRAINT IF EXISTS exactly_one_item_reference;
ALTER TABLE item_brands ADD CONSTRAINT exactly_one_item_reference
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id) = 1);

-- Add sake_id to recipe_ingredients table for recipe usage
ALTER TABLE recipe_ingredients ADD COLUMN sake_id UUID REFERENCES sakes(id);
CREATE INDEX idx_recipe_ingredients_sake_id ON recipe_ingredients(sake_id);

-- Update recipe_ingredients constraint to include sake_id
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS exactly_one_item_reference;
ALTER TABLE recipe_ingredients ADD CONSTRAINT exactly_one_item_reference
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, generic_item_id) = 1);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger for sakes table
CREATE TRIGGER set_updated_at_sakes
    BEFORE UPDATE ON sakes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- Update cellar_items constraint to include sake_id
ALTER TABLE cellar_items DROP CONSTRAINT IF EXISTS "Ensure exactly one item Id";
ALTER TABLE cellar_items ADD CONSTRAINT "Ensure exactly one item Id"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id) = 1);

-- Update type generation to include sake
ALTER TABLE cellar_items DROP COLUMN IF EXISTS type;
ALTER TABLE cellar_items ADD COLUMN type TEXT GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        WHEN sake_id IS NOT NULL THEN 'SAKE'::text
        ELSE 'SPIRIT'::text
    END
) STORED;

-- Verify all constraints are properly added
DO $$
BEGIN
    -- Check that sake was added to item_type
    IF NOT EXISTS (SELECT 1 FROM item_type WHERE value = 'SAKE') THEN
        RAISE EXCEPTION 'Failed to add sake to item_type enum';
    END IF;

    -- Check that main sakes table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sakes') THEN
        RAISE EXCEPTION 'Failed to create sakes table';
    END IF;

    -- Check that enum tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sake_category') THEN
        RAISE EXCEPTION 'Failed to create sake_category table';
    END IF;

    RAISE NOTICE 'Sake tables migration completed successfully';
END $$;