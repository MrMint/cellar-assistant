-- Convert Phase 2 tables to enum tables for Hasura
-- This migration converts coffee_species, coffee_roast_level, coffee_process, wine_style, and country to enum tables

-- 1. Convert coffee_species table to enum table
-- Drop foreign key constraints
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_species_fkey;

-- Rename table to enum naming convention
ALTER TABLE coffee_species RENAME TO coffee_species_enum;

-- Rename columns to Hasura enum convention
ALTER TABLE coffee_species_enum RENAME COLUMN text TO value;

-- Drop existing primary key and add new one
ALTER TABLE coffee_species_enum DROP CONSTRAINT IF EXISTS coffee_species_pkey;
ALTER TABLE coffee_species_enum ADD CONSTRAINT coffee_species_enum_pkey PRIMARY KEY (value);

-- Create foreign key with new table name
ALTER TABLE coffees ADD CONSTRAINT coffees_species_fkey 
  FOREIGN KEY (species) REFERENCES coffee_species_enum(value);

-- 2. Convert coffee_roast_level table to enum table
-- Drop foreign key constraints
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_roast_level_fkey;

-- Rename table to enum naming convention
ALTER TABLE coffee_roast_level RENAME TO coffee_roast_level_enum;

-- Rename columns to Hasura enum convention
ALTER TABLE coffee_roast_level_enum RENAME COLUMN text TO value;

-- Drop existing primary key and add new one
ALTER TABLE coffee_roast_level_enum DROP CONSTRAINT IF EXISTS coffee_roast_level_pkey;
ALTER TABLE coffee_roast_level_enum ADD CONSTRAINT coffee_roast_level_enum_pkey PRIMARY KEY (value);

-- Create foreign key with new table name
ALTER TABLE coffees ADD CONSTRAINT coffees_roast_level_fkey 
  FOREIGN KEY (roast_level) REFERENCES coffee_roast_level_enum(value);

-- 3. Convert coffee_process table to enum table
-- Drop foreign key constraints
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_process_fkey;

-- Rename table to enum naming convention
ALTER TABLE coffee_process RENAME TO coffee_process_enum;

-- Rename columns to Hasura enum convention
ALTER TABLE coffee_process_enum RENAME COLUMN text TO value;

-- Drop existing primary key and add new one
ALTER TABLE coffee_process_enum DROP CONSTRAINT IF EXISTS coffee_process_pkey;
ALTER TABLE coffee_process_enum ADD CONSTRAINT coffee_process_enum_pkey PRIMARY KEY (value);

-- Create foreign key with new table name
ALTER TABLE coffees ADD CONSTRAINT coffees_process_fkey 
  FOREIGN KEY (process) REFERENCES coffee_process_enum(value);

-- 4. Convert wine_style table to enum table
-- Drop foreign key constraints
ALTER TABLE wines DROP CONSTRAINT IF EXISTS wines_style_fkey;

-- Rename table to enum naming convention
ALTER TABLE wine_style RENAME TO wine_style_enum;

-- Rename columns to Hasura enum convention
ALTER TABLE wine_style_enum RENAME COLUMN text TO value;

-- Drop existing primary key (which was named wine_type_pkey) and add new one
ALTER TABLE wine_style_enum DROP CONSTRAINT IF EXISTS wine_type_pkey;
ALTER TABLE wine_style_enum ADD CONSTRAINT wine_style_enum_pkey PRIMARY KEY (value);

-- Create foreign key with new table name
ALTER TABLE wines ADD CONSTRAINT wines_style_fkey 
  FOREIGN KEY (style) REFERENCES wine_style_enum(value);

-- 5. Convert country table to enum table (largest conversion - 197 entries)
-- Drop all foreign key constraints that reference country
ALTER TABLE beers DROP CONSTRAINT IF EXISTS beers_country_fkey;
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffees_country_fkey;
ALTER TABLE coffees DROP CONSTRAINT IF EXISTS coffee_country_fkey; -- Additional constraint found
ALTER TABLE wines DROP CONSTRAINT IF EXISTS wines_country_fkey;
ALTER TABLE spirits DROP CONSTRAINT IF EXISTS spirits_country_fkey;

-- Rename table to enum naming convention
ALTER TABLE country RENAME TO country_enum;

-- Rename columns to Hasura enum convention
ALTER TABLE country_enum RENAME COLUMN text TO value;

-- Drop existing primary key and add new one
ALTER TABLE country_enum DROP CONSTRAINT IF EXISTS country_pkey;
ALTER TABLE country_enum ADD CONSTRAINT country_enum_pkey PRIMARY KEY (value);

-- Create foreign keys with new table name for all referencing tables
ALTER TABLE beers ADD CONSTRAINT beers_country_fkey 
  FOREIGN KEY (country) REFERENCES country_enum(value);

ALTER TABLE coffees ADD CONSTRAINT coffees_country_fkey 
  FOREIGN KEY (country) REFERENCES country_enum(value);

ALTER TABLE wines ADD CONSTRAINT wines_country_fkey 
  FOREIGN KEY (country) REFERENCES country_enum(value);

ALTER TABLE spirits ADD CONSTRAINT spirits_country_fkey 
  FOREIGN KEY (country) REFERENCES country_enum(value);