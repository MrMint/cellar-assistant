-- Add recipes, brands, and ingredients system
-- Created via implementation checklist Phase 0 & 1

-- Create generic_items table for ingredient templates
CREATE TABLE IF NOT EXISTS public.generic_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  item_type TEXT NOT NULL CHECK (item_type IN ('spirit', 'wine', 'beer', 'coffee', 'ingredient')),
  description TEXT,
  is_substitutable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generic_items_name_category ON public.generic_items (name, category);
CREATE INDEX IF NOT EXISTS idx_generic_items_item_type ON public.generic_items (item_type);
CREATE INDEX IF NOT EXISTS idx_generic_items_category ON public.generic_items (category);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_public_generic_items_updated_at') THEN
    CREATE TRIGGER set_public_generic_items_updated_at
      BEFORE UPDATE ON public.generic_items
      FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- Create brands table with hierarchical support
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  brand_type TEXT CHECK (brand_type IN ('brewery', 'distillery', 'winery', 'roastery', 'restaurant_chain', 'manufacturer', 'other')),
  parent_brand_id UUID REFERENCES public.brands(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON public.brands (name);
CREATE INDEX IF NOT EXISTS idx_brands_type ON public.brands (brand_type);
CREATE INDEX IF NOT EXISTS idx_brands_parent ON public.brands (parent_brand_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_public_brands_updated_at') THEN
    CREATE TRIGGER set_public_brands_updated_at
      BEFORE UPDATE ON public.brands
      FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- Create recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('food', 'cocktail')),
  canonical_recipe_id UUID REFERENCES public.recipes(id),
  difficulty_level INTEGER CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  prep_time_minutes INTEGER,
  serving_size INTEGER,
  image_url TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_name ON public.recipes (name);
CREATE INDEX IF NOT EXISTS idx_recipes_type ON public.recipes (type);
CREATE INDEX IF NOT EXISTS idx_recipes_canonical ON public.recipes (canonical_recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON public.recipes (difficulty_level);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_public_recipes_updated_at') THEN
    CREATE TRIGGER set_public_recipes_updated_at
      BEFORE UPDATE ON public.recipes
      FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- Create recipe_instructions table (normalized, replacing JSONB approach)
CREATE TABLE IF NOT EXISTS public.recipe_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction_text TEXT NOT NULL,
  instruction_type TEXT CHECK (instruction_type IN ('prep', 'mix', 'garnish', 'serve', 'cook', 'chill')),
  equipment_needed TEXT,
  time_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recipe_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_recipe_instructions_recipe_id ON public.recipe_instructions (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_instructions_step ON public.recipe_instructions (recipe_id, step_number);

-- Create polymorphic recipe_ingredients table
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  -- Polymorphic item references
  wine_id UUID REFERENCES public.wines(id),
  beer_id UUID REFERENCES public.beers(id),
  spirit_id UUID REFERENCES public.spirits(id),
  coffee_id UUID REFERENCES public.coffees(id),
  generic_item_id UUID REFERENCES public.generic_items(id),
  -- Ingredient details
  quantity DECIMAL,
  unit TEXT,
  is_optional BOOLEAN DEFAULT false,
  substitution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure exactly one item reference is non-null
  CONSTRAINT exactly_one_item_reference CHECK (
    (wine_id IS NOT NULL)::int + 
    (beer_id IS NOT NULL)::int + 
    (spirit_id IS NOT NULL)::int + 
    (coffee_id IS NOT NULL)::int + 
    (generic_item_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_wine_id ON public.recipe_ingredients (wine_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_beer_id ON public.recipe_ingredients (beer_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_spirit_id ON public.recipe_ingredients (spirit_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_coffee_id ON public.recipe_ingredients (coffee_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_generic_id ON public.recipe_ingredients (generic_item_id);

-- Create polymorphic item_brands relationship table
CREATE TABLE IF NOT EXISTS public.item_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Polymorphic item references
  wine_id UUID REFERENCES public.wines(id),
  beer_id UUID REFERENCES public.beers(id),
  spirit_id UUID REFERENCES public.spirits(id),
  coffee_id UUID REFERENCES public.coffees(id),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure exactly one item reference is non-null
  CONSTRAINT exactly_one_item_reference CHECK (
    (wine_id IS NOT NULL)::int + 
    (beer_id IS NOT NULL)::int + 
    (spirit_id IS NOT NULL)::int + 
    (coffee_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_item_brands_wine_id ON public.item_brands (wine_id);
CREATE INDEX IF NOT EXISTS idx_item_brands_beer_id ON public.item_brands (beer_id);
CREATE INDEX IF NOT EXISTS idx_item_brands_spirit_id ON public.item_brands (spirit_id);
CREATE INDEX IF NOT EXISTS idx_item_brands_coffee_id ON public.item_brands (coffee_id);
CREATE INDEX IF NOT EXISTS idx_item_brands_brand_id ON public.item_brands (brand_id);

-- Create place_brands relationship table
CREATE TABLE IF NOT EXISTS public.place_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('owned_by', 'affiliated_with', 'serves')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(place_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_place_brands_place_id ON public.place_brands (place_id);
CREATE INDEX IF NOT EXISTS idx_place_brands_brand_id ON public.place_brands (brand_id);

-- Create menu_item_recipes relationship table
CREATE TABLE IF NOT EXISTS public.menu_item_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.place_menu_items(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(menu_item_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_recipes_menu_item_id ON public.menu_item_recipes (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_recipes_recipe_id ON public.menu_item_recipes (recipe_id);

-- Create helpful views for detailed queries
CREATE OR REPLACE VIEW recipe_summary AS
SELECT 
  r.id,
  r.name,
  r.type,
  COUNT(ri.id) as ingredient_count
FROM recipes r
LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
GROUP BY r.id, r.name, r.type;

CREATE OR REPLACE VIEW recipe_ingredients_detailed AS
SELECT 
  ri.id,
  ri.recipe_id,
  ri.quantity,
  ri.unit,
  ri.is_optional,
  ri.substitution_notes,
  ri.wine_id,
  ri.beer_id,
  ri.spirit_id,
  ri.coffee_id,
  ri.generic_item_id,
  w.name as wine_name,
  b.name as beer_name,
  s.name as spirit_name,
  c.name as coffee_name,
  gi.name as generic_name,
  gi.category as generic_category
FROM recipe_ingredients ri
LEFT JOIN wines w ON ri.wine_id = w.id
LEFT JOIN beers b ON ri.beer_id = b.id
LEFT JOIN spirits s ON ri.spirit_id = s.id
LEFT JOIN coffees c ON ri.coffee_id = c.id
LEFT JOIN generic_items gi ON ri.generic_item_id = gi.id;

CREATE OR REPLACE VIEW item_brands_detailed AS
SELECT 
  ib.id,
  ib.wine_id,
  ib.beer_id,
  ib.spirit_id,
  ib.coffee_id,
  ib.brand_id,
  ib.is_primary,
  b.name as brand_name,
  b.brand_type,
  b.description as brand_description,
  w.name as wine_name,
  be.name as beer_name,
  s.name as spirit_name,
  c.name as coffee_name
FROM item_brands ib
JOIN brands b ON ib.brand_id = b.id
LEFT JOIN wines w ON ib.wine_id = w.id
LEFT JOIN beers be ON ib.beer_id = be.id
LEFT JOIN spirits s ON ib.spirit_id = s.id
LEFT JOIN coffees c ON ib.coffee_id = c.id;

-- Create helper function for recipe creation
CREATE OR REPLACE FUNCTION create_recipe_with_ingredients(
  recipe_name TEXT,
  recipe_description TEXT DEFAULT NULL,
  recipe_type TEXT DEFAULT 'cocktail'
) RETURNS UUID
AS $$
DECLARE
  new_recipe_id UUID;
BEGIN
  INSERT INTO recipes (name, description, type)
  VALUES (recipe_name, recipe_description, recipe_type)
  RETURNING id INTO new_recipe_id;
  
  RETURN new_recipe_id;
END;
$$ LANGUAGE plpgsql;