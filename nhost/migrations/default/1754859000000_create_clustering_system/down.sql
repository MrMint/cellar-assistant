-- Drop clustering system
DROP FUNCTION IF EXISTS search_places_adaptive_cluster(FLOAT, FLOAT, FLOAT, FLOAT, TEXT[], INTEGER);
DROP TABLE IF EXISTS place_search_results;