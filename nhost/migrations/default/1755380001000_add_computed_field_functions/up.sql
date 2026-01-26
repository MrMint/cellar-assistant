-- Function to count upvotes for a recipe
CREATE OR REPLACE FUNCTION count_recipe_upvotes(recipe_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM recipe_votes 
        WHERE recipe_id = recipe_uuid AND vote_type = 'upvote'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to count downvotes for a recipe
CREATE OR REPLACE FUNCTION count_recipe_downvotes(recipe_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM recipe_votes 
        WHERE recipe_id = recipe_uuid AND vote_type = 'downvote'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get user's vote for a recipe (returns 'upvote', 'downvote', or null)
CREATE OR REPLACE FUNCTION get_user_vote_for_recipe(recipe_uuid UUID, hasura_session JSON)
RETURNS TEXT AS $$
DECLARE
    user_uuid UUID;
    user_vote TEXT;
BEGIN
    -- Extract user ID from Hasura session
    user_uuid := (hasura_session->>'x-hasura-user-id')::UUID;
    
    SELECT vote_type INTO user_vote
    FROM recipe_votes 
    WHERE recipe_id = recipe_uuid AND user_id = user_uuid;
    
    RETURN user_vote;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to count total recipes in a group
CREATE OR REPLACE FUNCTION count_recipes_in_group(group_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM recipes 
        WHERE recipe_group_id = group_uuid
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate average rating for a recipe group
CREATE OR REPLACE FUNCTION calculate_group_average_rating(group_uuid UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN (
        SELECT AVG(rr.score)
        FROM recipe_reviews rr
        JOIN recipes r ON r.id = rr.recipe_id
        WHERE r.recipe_group_id = group_uuid
    );
END;
$$ LANGUAGE plpgsql STABLE;