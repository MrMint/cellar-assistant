-- Revert Phase 2 enum table conversions
-- This down migration reverts coffee_species_enum, coffee_roast_level_enum, coffee_process_enum, wine_style_enum, and country_enum back to original tables

-- 1. Revert coffee_species_enum back to coffee_species
-- Drop foreign key constraints
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_species_fkey;

-- Rename table back to original name
ALTER TABLE coffee_species_enum RENAME TO coffee_species;

-- Rename columns back to original names
ALTER TABLE coffee_species RENAME COLUMN value TO text;

-- Drop the primary key constraint
ALTER TABLE coffee_species DROP CONSTRAINT IF EXISTS coffee_species_enum_pkey;

-- Recreate foreign key with original table name
ALTER TABLE coffees ADD CONSTRAINT coffees_species_fkey 
  FOREIGN KEY (species) REFERENCES coffee_species(text);

-- 2. Revert coffee_roast_level_enum back to coffee_roast_level
-- Drop foreign key constraints
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_roast_level_fkey;

-- Rename table back to original name
ALTER TABLE coffee_roast_level_enum RENAME TO coffee_roast_level;

-- Rename columns back to original names
ALTER TABLE coffee_roast_level RENAME COLUMN value TO text;

-- Drop the primary key constraint
ALTER TABLE coffee_roast_level DROP CONSTRAINT IF EXISTS coffee_roast_level_enum_pkey;

-- Recreate foreign key with original table name
ALTER TABLE coffees ADD CONSTRAINT coffees_roast_level_fkey 
  FOREIGN KEY (roast_level) REFERENCES coffee_roast_level(text);

-- 3. Revert coffee_process_enum back to coffee_process
-- Drop foreign key constraints
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_process_fkey;

-- Rename table back to original name
ALTER TABLE coffee_process_enum RENAME TO coffee_process;

-- Rename columns back to original names
ALTER TABLE coffee_process RENAME COLUMN value TO text;

-- Drop the primary key constraint
ALTER TABLE coffee_process DROP CONSTRAINT IF EXISTS coffee_process_enum_pkey;

-- Recreate foreign key with original table name
ALTER TABLE coffees ADD CONSTRAINT coffees_process_fkey 
  FOREIGN KEY (process) REFERENCES coffee_process(text);

-- 4. Revert wine_style_enum back to wine_style
-- Drop foreign key constraints
ALTER TABLE wines DROP CONSTRAINT IF EXISTS wines_style_fkey;

-- Rename table back to original name
ALTER TABLE wine_style_enum RENAME TO wine_style;

-- Rename columns back to original names
ALTER TABLE wine_style RENAME COLUMN value TO text;

-- Drop the primary key constraint
ALTER TABLE wine_style DROP CONSTRAINT IF EXISTS wine_style_enum_pkey;

-- Recreate foreign key with original table name
ALTER TABLE wines ADD CONSTRAINT wines_style_fkey 
  FOREIGN KEY (style) REFERENCES wine_style(text);

-- 5. Revert country_enum back to country
-- Drop all foreign key constraints that reference country_enum
ALTER TABLE beers DROP CONSTRAINT IF EXISTS beers_country_fkey;
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_country_fkey;
ALTER TABLE wines DROP CONSTRAINT IF EXISTS wines_country_fkey;
ALTER TABLE spirits DROP CONSTRAINT IF EXISTS spirits_country_fkey;
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_country_fkey;

-- Rename table back to original name
ALTER TABLE country_enum RENAME TO country;

-- Rename columns back to original names
ALTER TABLE country RENAME COLUMN value TO text;

-- Drop the primary key constraint
ALTER TABLE country DROP CONSTRAINT IF EXISTS country_enum_pkey;

-- Recreate foreign keys with original table name for all referencing tables
ALTER TABLE beers ADD CONSTRAINT beers_country_fkey 
  FOREIGN KEY (country) REFERENCES country(text);

ALTER TABLE coffees ADD CONSTRAINT coffees_country_fkey 
  FOREIGN KEY (country) REFERENCES country(text);

ALTER TABLE wines ADD CONSTRAINT wines_country_fkey 
  FOREIGN KEY (country) REFERENCES country(text);

ALTER TABLE spirits ADD CONSTRAINT spirits_country_fkey 
  FOREIGN KEY (country) REFERENCES country(text);

-- Recreate places foreign key if it should exist
-- ALTER TABLE places ADD CONSTRAINT places_country_fkey 
--   FOREIGN KEY (country) REFERENCES country(text);