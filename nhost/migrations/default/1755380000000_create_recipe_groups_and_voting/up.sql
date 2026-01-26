-- Create recipe_groups table as canonical cocktail entities
CREATE TABLE recipe_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- e.g., 'cocktail', 'mocktail', 'shot'
    base_spirit TEXT, -- e.g., 'gin', 'vodka', 'rum'
    tags TEXT[], -- searchable tags like 'citrusy', 'sweet', 'strong'
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT recipe_groups_name_check CHECK (length(name) > 0),
    CONSTRAINT recipe_groups_category_check CHECK (category IN ('cocktail', 'mocktail', 'shot', 'punch', 'other'))
);

-- Create recipe_votes table for the voting system
CREATE TABLE recipe_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure one vote per user per recipe
    UNIQUE(recipe_id, user_id)
);

-- Add recipe_group_id to recipes table
ALTER TABLE recipes 
ADD COLUMN recipe_group_id UUID REFERENCES recipe_groups(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_recipe_votes_recipe_id ON recipe_votes(recipe_id);
CREATE INDEX idx_recipe_votes_user_id ON recipe_votes(user_id);
CREATE INDEX idx_recipe_votes_vote_type ON recipe_votes(vote_type);
CREATE INDEX idx_recipes_group_id ON recipes(recipe_group_id);
CREATE INDEX idx_recipe_groups_category ON recipe_groups(category);
CREATE INDEX idx_recipe_groups_base_spirit ON recipe_groups(base_spirit);
CREATE INDEX idx_recipe_groups_tags ON recipe_groups USING gin(tags);

-- Function to calculate vote score for a recipe (upvotes - downvotes)
CREATE OR REPLACE FUNCTION calculate_recipe_vote_score(recipe_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT 
            COALESCE(SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE -1 END), 0)
        FROM recipe_votes 
        WHERE recipe_id = recipe_uuid
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get the canonical recipe for a group (highest vote score, newest as tiebreaker)
CREATE OR REPLACE FUNCTION get_canonical_recipe_for_group(group_uuid UUID)
RETURNS UUID AS $$
DECLARE
    canonical_recipe_uuid UUID;
BEGIN
    SELECT r.id INTO canonical_recipe_uuid
    FROM recipes r
    WHERE r.recipe_group_id = group_uuid
    ORDER BY 
        calculate_recipe_vote_score(r.id) DESC,
        r.created_at DESC
    LIMIT 1;
    
    RETURN canonical_recipe_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update trigger to set updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_recipe_groups_updated_at
    BEFORE UPDATE ON recipe_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipe_votes_updated_at
    BEFORE UPDATE ON recipe_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();