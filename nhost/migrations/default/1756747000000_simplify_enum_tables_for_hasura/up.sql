-- Simplify instruction_types and brand_types tables to work as Hasura enum tables
-- This migration removes unnecessary columns and drops companion enum tables

-- First, let's preserve the data we need and simplify instruction_types table
-- Create a temporary table with the simplified structure
CREATE TABLE instruction_types_temp (
    id TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy the essential data, using description as comment
INSERT INTO instruction_types_temp (id, comment)
SELECT id, description FROM instruction_types;

-- Drop the old table (this will cascade and remove foreign key constraints temporarily)
DROP TABLE instruction_types CASCADE;

-- Rename the temp table to the final name
ALTER TABLE instruction_types_temp RENAME TO instruction_types;

-- Do the same for brand_types
CREATE TABLE brand_types_temp (
    id TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy the essential data, using description as comment
INSERT INTO brand_types_temp (id, comment)
SELECT id, description FROM brand_types;

-- Drop the old table (this will cascade and remove foreign key constraints temporarily)
DROP TABLE brand_types CASCADE;

-- Rename the temp table to the final name
ALTER TABLE brand_types_temp RENAME TO brand_types;

-- Recreate the foreign key constraints
ALTER TABLE recipe_instructions 
ADD CONSTRAINT fk_instruction_type 
FOREIGN KEY (instruction_type) REFERENCES instruction_types(id);

ALTER TABLE brands 
ADD CONSTRAINT fk_brand_type 
FOREIGN KEY (brand_type) REFERENCES brand_types(id);

-- Drop the companion enum tables that are no longer needed
DROP TABLE IF EXISTS instruction_types_enum;
DROP TABLE IF EXISTS brand_types_enum;

-- Add comments to document these as enum tables
COMMENT ON TABLE instruction_types IS 'Enum table for recipe instruction types';
COMMENT ON TABLE brand_types IS 'Enum table for brand types';