-- Function to update canonical recipe for a recipe group based on voting
CREATE OR REPLACE FUNCTION update_canonical_recipe()
RETURNS TRIGGER AS $$
DECLARE
    affected_group_id UUID;
    current_canonical_id UUID;
    new_canonical_id UUID;
    current_canonical_name TEXT;
    new_canonical_name TEXT;
BEGIN
    -- Determine which recipe group is affected
    -- Handle both INSERT/UPDATE (NEW) and DELETE (OLD) scenarios
    IF TG_OP = 'DELETE' THEN
        SELECT recipe_group_id INTO affected_group_id 
        FROM recipes 
        WHERE id = OLD.recipe_id;
    ELSE
        SELECT recipe_group_id INTO affected_group_id 
        FROM recipes 
        WHERE id = NEW.recipe_id;
    END IF;
    
    -- Skip if recipe is not part of a group
    IF affected_group_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Get current canonical recipe for the group
    SELECT canonical_recipe_id INTO current_canonical_id
    FROM recipe_groups 
    WHERE id = affected_group_id;
    
    -- Calculate new canonical recipe (highest net vote score, oldest wins ties)
    SELECT r.id INTO new_canonical_id
    FROM recipes r
    WHERE r.recipe_group_id = affected_group_id
    ORDER BY 
        -- Calculate net vote score (upvotes - downvotes)
        (SELECT COALESCE(SUM(CASE WHEN rv.vote_type = 'upvote' THEN 1 ELSE -1 END), 0)
         FROM recipe_votes rv 
         WHERE rv.recipe_id = r.id) DESC,
        -- Use creation date as tiebreaker (oldest wins)
        r.created_at ASC
    LIMIT 1;
    
    -- Update canonical recipe if it has changed
    IF new_canonical_id IS DISTINCT FROM current_canonical_id THEN
        -- Get the name of the new canonical recipe
        SELECT name INTO new_canonical_name
        FROM recipes 
        WHERE id = new_canonical_id;
        
        -- Update recipe group with new canonical recipe and name
        UPDATE recipe_groups 
        SET 
            canonical_recipe_id = new_canonical_id,
            name = COALESCE(new_canonical_name, name),
            updated_at = NOW()
        WHERE id = affected_group_id;
        
        -- Log the change for debugging
        RAISE NOTICE 'Updated canonical recipe for group % from % to %', 
            affected_group_id, current_canonical_id, new_canonical_id;
    END IF;
    
    -- Return appropriate record based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create triggers on recipe_votes for INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_insert ON recipe_votes;
CREATE TRIGGER trigger_update_canonical_recipe_on_vote_insert
    AFTER INSERT ON recipe_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_recipe();

DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_update ON recipe_votes;
CREATE TRIGGER trigger_update_canonical_recipe_on_vote_update
    AFTER UPDATE ON recipe_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_recipe();

DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_delete ON recipe_votes;
CREATE TRIGGER trigger_update_canonical_recipe_on_vote_delete
    AFTER DELETE ON recipe_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_recipe();

-- Function to trigger embedding regeneration for recipe groups
-- This follows the pattern used for items in the existing codebase
CREATE OR REPLACE FUNCTION trigger_recipe_group_embedding_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger embedding update if canonical_recipe_id has changed
    IF OLD.canonical_recipe_id IS DISTINCT FROM NEW.canonical_recipe_id THEN
        -- Log the embedding update trigger
        RAISE NOTICE 'Recipe group embedding update triggered for group %', NEW.id;
        
        -- Note: The actual embedding generation will be handled by a separate function
        -- that can be called via webhook or async job queue, similar to the existing
        -- item vector generation pattern in functions/generateItemVector/
        
        -- For now, we just update the updated_at timestamp to mark it for processing
        NEW.updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for recipe group embedding updates
DROP TRIGGER IF EXISTS trigger_recipe_group_embedding_update ON recipe_groups;
CREATE TRIGGER trigger_recipe_group_embedding_update
    BEFORE UPDATE ON recipe_groups
    FOR EACH ROW
    EXECUTE FUNCTION trigger_recipe_group_embedding_update();

-- Add helpful utility functions for debugging and monitoring

-- Function to get vote summary for a recipe
CREATE OR REPLACE FUNCTION get_recipe_vote_summary(recipe_uuid UUID)
RETURNS TABLE(
    recipe_id UUID,
    upvotes INTEGER,
    downvotes INTEGER,
    net_score INTEGER,
    total_votes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        recipe_uuid as recipe_id,
        COALESCE(SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE 0 END)::INTEGER, 0) as upvotes,
        COALESCE(SUM(CASE WHEN vote_type = 'downvote' THEN 1 ELSE 0 END)::INTEGER, 0) as downvotes,
        COALESCE(SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE -1 END)::INTEGER, 0) as net_score,
        COALESCE(COUNT(*)::INTEGER, 0) as total_votes
    FROM recipe_votes 
    WHERE recipe_votes.recipe_id = recipe_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get canonical recipe calculation for a group (for debugging)
CREATE OR REPLACE FUNCTION get_canonical_recipe_calculation(group_uuid UUID)
RETURNS TABLE(
    recipe_id UUID,
    recipe_name TEXT,
    net_score INTEGER,
    created_at TIMESTAMPTZ,
    is_current_canonical BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as recipe_id,
        r.name as recipe_name,
        COALESCE((SELECT SUM(CASE WHEN rv.vote_type = 'upvote' THEN 1 ELSE -1 END)
                  FROM recipe_votes rv WHERE rv.recipe_id = r.id), 0)::INTEGER as net_score,
        r.created_at,
        (r.id = (SELECT canonical_recipe_id FROM recipe_groups WHERE id = group_uuid)) as is_current_canonical
    FROM recipes r
    WHERE r.recipe_group_id = group_uuid
    ORDER BY 
        net_score DESC,
        r.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;