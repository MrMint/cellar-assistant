-- Migration rollback: Restore check constraints from enum tables
-- This migration restores the original check constraints and removes enum tables

-- Remove foreign key constraints
ALTER TABLE recipe_instructions 
DROP CONSTRAINT IF EXISTS fk_instruction_type;

ALTER TABLE brands 
DROP CONSTRAINT IF EXISTS fk_brand_type;

-- Restore check constraints
ALTER TABLE recipe_instructions 
ADD CONSTRAINT recipe_instructions_instruction_type_check 
CHECK (instruction_type IN ('prep', 'mix', 'garnish', 'serve', 'cook', 'chill'));

ALTER TABLE brands 
ADD CONSTRAINT brands_brand_type_check 
CHECK (brand_type IN ('brewery', 'distillery', 'winery', 'roastery', 'restaurant_chain', 'manufacturer', 'other'));

-- Drop indexes
DROP INDEX IF EXISTS idx_recipe_instructions_type;
DROP INDEX IF EXISTS idx_brands_type;
DROP INDEX IF EXISTS idx_instruction_types_active;
DROP INDEX IF EXISTS idx_brand_types_active;

-- Drop enum tables
DROP TABLE IF EXISTS instruction_types CASCADE;
DROP TABLE IF EXISTS brand_types CASCADE;