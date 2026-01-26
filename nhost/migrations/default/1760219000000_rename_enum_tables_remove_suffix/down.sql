-- Reverse the enum table renaming - add back the _enum suffix

BEGIN;

-- Phase 1: Drop foreign key constraints for the renamed tables

-- Drop foreign key constraints for coffee_species
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_species_fkey;

-- Drop foreign key constraints for coffee_roast_level
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_roast_level_fkey;

-- Drop foreign key constraints for coffee_process
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_process_fkey;

-- Drop foreign key constraints for wine_style
ALTER TABLE public.wines DROP CONSTRAINT IF EXISTS wines_style_fkey;

-- Drop foreign key constraints for country
ALTER TABLE public.wines DROP CONSTRAINT IF EXISTS wines_country_fkey;
ALTER TABLE public.beers DROP CONSTRAINT IF EXISTS beers_country_fkey;
ALTER TABLE public.spirits DROP CONSTRAINT IF EXISTS spirits_country_fkey;
ALTER TABLE public.coffees DROP CONSTRAINT IF EXISTS coffees_country_fkey;
ALTER TABLE public.sakes DROP CONSTRAINT IF EXISTS sakes_country_fkey;

-- Phase 2: Rename tables back to include _enum suffix

ALTER TABLE public.coffee_species RENAME TO coffee_species_enum;
ALTER TABLE public.coffee_roast_level RENAME TO coffee_roast_level_enum;
ALTER TABLE public.coffee_process RENAME TO coffee_process_enum;
ALTER TABLE public.wine_style RENAME TO wine_style_enum;
ALTER TABLE public.country RENAME TO country_enum;

-- Phase 3: Recreate foreign key constraints with original table names

-- Recreate foreign key constraints for coffee_species_enum
ALTER TABLE public.coffees
ADD CONSTRAINT coffees_species_fkey
FOREIGN KEY (species) REFERENCES public.coffee_species_enum(text);

-- Recreate foreign key constraints for coffee_roast_level_enum
ALTER TABLE public.coffees
ADD CONSTRAINT coffees_roast_level_fkey
FOREIGN KEY (roast_level) REFERENCES public.coffee_roast_level_enum(text);

-- Recreate foreign key constraints for coffee_process_enum
ALTER TABLE public.coffees
ADD CONSTRAINT coffees_process_fkey
FOREIGN KEY (process) REFERENCES public.coffee_process_enum(text);

-- Recreate foreign key constraints for wine_style_enum
ALTER TABLE public.wines
ADD CONSTRAINT wines_style_fkey
FOREIGN KEY (style) REFERENCES public.wine_style_enum(text);

-- Recreate foreign key constraints for country_enum
ALTER TABLE public.wines
ADD CONSTRAINT wines_country_fkey
FOREIGN KEY (country) REFERENCES public.country_enum(text);

ALTER TABLE public.beers
ADD CONSTRAINT beers_country_fkey
FOREIGN KEY (country) REFERENCES public.country_enum(text);

ALTER TABLE public.spirits
ADD CONSTRAINT spirits_country_fkey
FOREIGN KEY (country) REFERENCES public.country_enum(text);

ALTER TABLE public.coffees
ADD CONSTRAINT coffees_country_fkey
FOREIGN KEY (country) REFERENCES public.country_enum(text);

ALTER TABLE public.sakes
ADD CONSTRAINT sakes_country_fkey
FOREIGN KEY (country) REFERENCES public.country_enum(text);

COMMIT;
