-- Standardize enum tables to follow Hasura conventions:
-- 1. Remove _enum suffix from table names
-- 2. Rename primary key column to 'value' (Hasura standard)

BEGIN;

-- ============================================================================
-- PART 1: Rename enum tables that have _enum suffix
-- ============================================================================

-- Drop foreign key constraints
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_species_fkey;
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_roast_level_fkey;
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_process_fkey;
ALTER TABLE public.wines DROP CONSTRAINT IF EXISTS wines_style_fkey;
ALTER TABLE public.wines DROP CONSTRAINT IF EXISTS wines_country_fkey;
ALTER TABLE public.beers DROP CONSTRAINT IF EXISTS beers_country_fkey;
ALTER TABLE public.spirits DROP CONSTRAINT IF EXISTS spirits_country_fkey;
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_country_fkey;
ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_country_fkey;

-- Rename tables to remove _enum suffix
ALTER TABLE public.coffee_species_enum RENAME TO coffee_species;
ALTER TABLE public.coffee_roast_level_enum RENAME TO coffee_roast_level;
ALTER TABLE public.coffee_process_enum RENAME TO coffee_process;
ALTER TABLE public.wine_style_enum RENAME TO wine_style;
ALTER TABLE public.country_enum RENAME TO country;

-- Recreate foreign key constraints (these tables already have 'value' column)
ALTER TABLE public.coffees ADD CONSTRAINT coffees_species_fkey FOREIGN KEY (species) REFERENCES public.coffee_species(value);
ALTER TABLE public.coffees ADD CONSTRAINT coffees_roast_level_fkey FOREIGN KEY (roast_level) REFERENCES public.coffee_roast_level(value);
ALTER TABLE public.coffees ADD CONSTRAINT coffees_process_fkey FOREIGN KEY (process) REFERENCES public.coffee_process(value);
ALTER TABLE public.wines ADD CONSTRAINT wines_style_fkey FOREIGN KEY (style) REFERENCES public.wine_style(value);
ALTER TABLE public.wines ADD CONSTRAINT wines_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);
ALTER TABLE public.beers ADD CONSTRAINT beers_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);
ALTER TABLE public.spirits ADD CONSTRAINT spirits_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);
ALTER TABLE public.coffees ADD CONSTRAINT coffees_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);
ALTER TABLE public.sakes ADD CONSTRAINT sakes_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);

-- ============================================================================
-- PART 2: Rename 'text' column to 'value' in enum tables
-- ============================================================================

-- Drop foreign key constraints for tables with 'text' column
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_cultivar_fkey;
ALTER TABLE public.wines DROP CONSTRAINT IF EXISTS wines_variety_fkey;
ALTER TABLE public.spirits DROP CONSTRAINT IF EXISTS spirits_type_fkey;
ALTER TABLE public.beers DROP CONSTRAINT IF EXISTS beers_style_fkey;

-- Rename 'text' column to 'value' in enum tables
ALTER TABLE public.coffee_cultivar RENAME COLUMN text TO value;
ALTER TABLE public.wine_variety RENAME COLUMN text TO value;
ALTER TABLE public.spirit_type RENAME COLUMN text TO value;
ALTER TABLE public.beer_style RENAME COLUMN text TO value;

-- Recreate foreign key constraints with new column name
ALTER TABLE public.coffees ADD CONSTRAINT coffees_cultivar_fkey FOREIGN KEY (cultivar) REFERENCES public.coffee_cultivar(value);
ALTER TABLE public.wines ADD CONSTRAINT wines_variety_fkey FOREIGN KEY (variety) REFERENCES public.wine_variety(value);
ALTER TABLE public.spirits ADD CONSTRAINT spirits_type_fkey FOREIGN KEY (type) REFERENCES public.spirit_type(value);
ALTER TABLE public.beers ADD CONSTRAINT beers_style_fkey FOREIGN KEY (style) REFERENCES public.beer_style(value);

COMMIT;
