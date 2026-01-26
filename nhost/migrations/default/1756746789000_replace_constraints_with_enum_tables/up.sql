-- Migration: Replace check constraints with enum tables
-- This migration creates dedicated enum tables for instruction_types and brand_types
-- to improve GraphQL integration, error handling, and maintainability.

-- Create instruction_types enum table
CREATE TABLE instruction_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert instruction types seed data
INSERT INTO instruction_types (id, name, description, sort_order) VALUES 
('prep', 'Prepare', 'Preparation steps', 10),
('mix', 'Mix', 'Mixing, shaking, stirring', 20),
('garnish', 'Garnish', 'Garnishing and finishing', 30),
('serve', 'Serve', 'Serving instructions', 40),
('cook', 'Cook', 'Cooking steps', 50),
('chill', 'Chill', 'Chilling steps', 60);

-- Create brand_types enum table
CREATE TABLE brand_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert brand types seed data
INSERT INTO brand_types (id, name, description, sort_order) VALUES
('brewery', 'Brewery', 'Beer manufacturers', 10),
('distillery', 'Distillery', 'Spirit manufacturers', 20),
('winery', 'Winery', 'Wine manufacturers', 30),
('roastery', 'Roastery', 'Coffee roasters', 40),
('restaurant_chain', 'Restaurant Chain', 'Restaurant brands', 50),
('manufacturer', 'Manufacturer', 'General manufacturers', 60),
('other', 'Other', 'Other brand types', 70);

-- Remove check constraints and add foreign keys
-- First, update any invalid data to match enum values (defensive approach)
UPDATE recipe_instructions 
SET instruction_type = 'prep' 
WHERE instruction_type NOT IN ('prep', 'mix', 'garnish', 'serve', 'cook', 'chill');

UPDATE brands 
SET brand_type = 'other' 
WHERE brand_type NOT IN ('brewery', 'distillery', 'winery', 'roastery', 'restaurant_chain', 'manufacturer', 'other');

-- Drop check constraints
ALTER TABLE recipe_instructions 
DROP CONSTRAINT IF EXISTS recipe_instructions_instruction_type_check;

ALTER TABLE brands 
DROP CONSTRAINT IF EXISTS brands_brand_type_check;

-- Add foreign key constraints
ALTER TABLE recipe_instructions 
ADD CONSTRAINT fk_instruction_type 
  FOREIGN KEY (instruction_type) REFERENCES instruction_types(id);

ALTER TABLE brands 
ADD CONSTRAINT fk_brand_type 
  FOREIGN KEY (brand_type) REFERENCES brand_types(id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_instruction_types_active ON instruction_types(is_active);
CREATE INDEX IF NOT EXISTS idx_brand_types_active ON brand_types(is_active);
CREATE INDEX IF NOT EXISTS idx_recipe_instructions_type ON recipe_instructions(instruction_type);
CREATE INDEX IF NOT EXISTS idx_brands_type ON brands(brand_type);

-- Add unique constraints to prevent duplicate names
ALTER TABLE instruction_types ADD CONSTRAINT unique_instruction_type_name UNIQUE (name);
ALTER TABLE brand_types ADD CONSTRAINT unique_brand_type_name UNIQUE (name);

COMMENT ON TABLE instruction_types IS 'Enum table for recipe instruction types - replaces check constraint';
COMMENT ON TABLE brand_types IS 'Enum table for brand types - replaces check constraint';