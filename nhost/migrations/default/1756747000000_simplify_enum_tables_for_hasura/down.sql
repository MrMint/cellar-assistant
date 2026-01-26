-- Reverse the simplification of enum tables
-- This restores the original structure with all columns

-- Drop the simplified tables (this will cascade and remove foreign key constraints)
DROP TABLE instruction_types CASCADE;
DROP TABLE brand_types CASCADE;

-- Recreate instruction_types with original structure
CREATE TABLE instruction_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Recreate brand_types with original structure
CREATE TABLE brand_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Re-insert the original data for instruction_types
INSERT INTO instruction_types (id, name, description, sort_order, is_active, created_at) VALUES
('prep', 'Prepare', 'Preparation steps', 1, true, now()),
('mix', 'Mix', 'Mixing, shaking, stirring', 2, true, now()),
('cook', 'Cook', 'Cooking steps', 3, true, now()),
('chill', 'Chill', 'Chilling steps', 4, true, now()),
('garnish', 'Garnish', 'Garnishing and finishing', 5, true, now()),
('serve', 'Serve', 'Serving instructions', 6, true, now());

-- Re-insert the original data for brand_types
INSERT INTO brand_types (id, name, description, sort_order, is_active, created_at) VALUES
('brewery', 'Brewery', 'Beer manufacturers', 1, true, now()),
('winery', 'Winery', 'Wine manufacturers', 2, true, now()),
('distillery', 'Distillery', 'Spirit manufacturers', 3, true, now()),
('roastery', 'Roastery', 'Coffee roasters', 4, true, now()),
('restaurant_chain', 'Restaurant Chain', 'Restaurant brands', 5, true, now()),
('manufacturer', 'Manufacturer', 'General manufacturers', 6, true, now()),
('other', 'Other', 'Other brand types', 7, true, now());

-- Recreate the foreign key constraints
ALTER TABLE recipe_instructions 
ADD CONSTRAINT fk_instruction_type 
FOREIGN KEY (instruction_type) REFERENCES instruction_types(id);

ALTER TABLE brands 
ADD CONSTRAINT fk_brand_type 
FOREIGN KEY (brand_type) REFERENCES brand_types(id);

-- Recreate the companion enum tables
CREATE TABLE instruction_types_enum (
    text TEXT PRIMARY KEY,
    comment TEXT
);

CREATE TABLE brand_types_enum (
    text TEXT PRIMARY KEY,
    comment TEXT
);

-- Populate the enum tables
INSERT INTO instruction_types_enum (text, comment)
SELECT id, description FROM instruction_types;

INSERT INTO brand_types_enum (text, comment)  
SELECT id, description FROM brand_types;