-- The schema every database is built from: a schema-only `pg_dump` at the
-- migration ledger's horizon (`BASELINE_HORIZON` in `../src/migrate/ledger.ts`).
-- `build.sh` restores it and `db:migrate` applies every later migration.
--
-- Never edit it: it is checksum-pinned (`../src/migrate/baseline-freeze.test.ts`).
-- A schema change is a new migration under `../migrations`.

--
-- PostgreSQL database dump
--

\restrict wRGOt5PHdLVRlOKG7QOf7pbUFBt9e6xpPjUi7MnEGcHjL6hsRpO7UrvMycxmO3s

-- Dumped from database version 18.7 (Debian 18.7-1.pgdg12+5)
-- Dumped by pg_dump version 18.7 (Debian 18.7-1.pgdg12+5)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: admin; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA admin;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: brand_types; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.brand_types AS ENUM (
    'brewery',
    'distillery',
    'kura',
    'manufacturer',
    'other',
    'restaurant_chain',
    'roastery',
    'tea_house',
    'winery'
);


--
-- Name: coffee_process; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coffee_process AS ENUM (
    'HONEY',
    'NATURAL_DRY',
    'PULPED_NATURAL',
    'PULPED_NATURAL_HONEY',
    'WASHED',
    'WET_HULLED'
);


--
-- Name: coffee_roast_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coffee_roast_level AS ENUM (
    'DARK',
    'EXTRA_DARK',
    'LIGHT',
    'LIGHT_MEDIUM',
    'MEDIUM',
    'MEDIUM_DARK'
);


--
-- Name: coffee_species; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coffee_species AS ENUM (
    'ARABICA',
    'CHARRIERIANA',
    'LIBERICA',
    'ROBUSTA',
    'STENOPHYLLA'
);


--
-- Name: friend_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.friend_request_status AS ENUM (
    'ACCEPTED',
    'PENDING'
);


--
-- Name: instruction_types; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instruction_types AS ENUM (
    'chill',
    'cook',
    'garnish',
    'mix',
    'prep',
    'serve'
);


--
-- Name: item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_type AS ENUM (
    'BEER',
    'COFFEE',
    'SAKE',
    'SPIRIT',
    'TEA',
    'WINE'
);


--
-- Name: permission_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.permission_type AS ENUM (
    'FRIENDS',
    'PRIVATE',
    'PUBLIC'
);


--
-- Name: place_search_results_new; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.place_search_results_new AS (
	is_cluster boolean,
	cluster_id integer,
	cluster_count integer,
	cluster_center text,
	cluster_bounds text,
	id uuid,
	name text,
	location text,
	primary_category text,
	categories text[],
	confidence numeric(3,2),
	street_address text,
	locality text,
	region text,
	postcode text,
	country_code character(2),
	phone text,
	website text,
	email text,
	hours jsonb,
	price_level integer,
	rating numeric(2,1),
	review_count integer,
	is_verified boolean,
	viewport_area_km2 double precision,
	density_per_km2 double precision,
	clustering_applied boolean
);


--
-- Name: recipe_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recipe_category AS ENUM (
    'cocktail',
    'mocktail',
    'other',
    'punch',
    'shot'
);


--
-- Name: sake_serving_temperature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sake_serving_temperature AS ENUM (
    'atsu_kan',
    'hitohada_kan',
    'hiya',
    'jo_kan',
    'nuru_kan',
    'rei_shu',
    'room_temperature',
    'tobikiri_kan',
    'yuki_hie'
);


--
-- Name: tea_caffeine_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tea_caffeine_level AS ENUM (
    'decaf',
    'high',
    'low',
    'medium',
    'none'
);


--
-- Name: tea_form; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tea_form AS ENUM (
    'brick',
    'instant',
    'loose_leaf',
    'matcha_powder',
    'sachet',
    'tea_bag'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: category_vectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_vectors (
    id integer NOT NULL,
    label text NOT NULL,
    label_type text DEFAULT 'category'::text NOT NULL,
    associated_categories text[] DEFAULT '{}'::text[],
    vector public.halfvec(768) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT category_vectors_label_type_check CHECK ((label_type = ANY (ARRAY['category'::text, 'alias'::text, 'item_type'::text, 'descriptor'::text])))
);


--
-- Name: calculate_category_vector_distance(public.category_vectors, public.halfvec); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_category_vector_distance(category_vector public.category_vectors, query_vector public.halfvec) RETURNS double precision
    LANGUAGE sql STABLE
    AS $$
  SELECT category_vector.vector <=> query_vector
$$;


--
-- Name: places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    overture_id text,
    name text NOT NULL,
    display_name text,
    categories text[] NOT NULL,
    confidence numeric(3,2),
    location public.geography(Point,4326) NOT NULL,
    street_address text,
    locality text,
    region text,
    postcode text,
    country_code character(2),
    phone text,
    website text,
    email text,
    hours jsonb,
    price_level integer,
    rating numeric(2,1),
    review_count integer DEFAULT 0,
    access_count integer DEFAULT 0,
    last_accessed_at timestamp with time zone,
    first_cached_reason text,
    source_tags jsonb,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_sync_at timestamp with time zone,
    primary_category text GENERATED ALWAYS AS (categories[1]) STORED,
    search_text tsvector,
    created_by uuid,
    source text DEFAULT 'overture'::text NOT NULL,
    description text,
    google_place_id text,
    CONSTRAINT places_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT places_price_level_check CHECK (((price_level >= 1) AND (price_level <= 4))),
    CONSTRAINT places_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT places_source_check CHECK ((source = ANY (ARRAY['overture'::text, 'user'::text, 'merged'::text])))
);


--
-- Name: calculate_distance(public.places, public.geography); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_distance(place_row public.places, user_location public.geography) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN ST_Distance(place_row.location, user_location);
END;
$$;


--
-- Name: calculate_group_average_rating(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_group_average_rating(group_uuid uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (
        SELECT AVG(rr.score)
        FROM recipe_reviews rr
        JOIN recipes r ON r.id = rr.recipe_id
        WHERE r.recipe_group_id = group_uuid
    );
END;
$$;


--
-- Name: place_vectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_vectors (
    id integer NOT NULL,
    vector public.halfvec(768) NOT NULL,
    place_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: calculate_place_vector_distance(public.place_vectors, public.halfvec); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_place_vector_distance(place_vector public.place_vectors, search public.halfvec) RETURNS double precision
    LANGUAGE sql STABLE
    AS $$
  SELECT place_vector.vector <=> search
$$;


--
-- Name: recipe_vectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_vectors (
    id integer NOT NULL,
    vector public.halfvec(768) NOT NULL,
    recipe_id uuid NOT NULL,
    embedding_text text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: calculate_recipe_vector_distance(public.recipe_vectors, public.halfvec); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_recipe_vector_distance(recipe_vector public.recipe_vectors, query_vector public.halfvec) RETURNS double precision
    LANGUAGE sql STABLE
    AS $$
  SELECT recipe_vector.vector <=> query_vector
$$;


--
-- Name: calculate_recipe_vote_score(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_recipe_vote_score(recipe_uuid uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (
        SELECT 
            COALESCE(SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE -1 END), 0)
        FROM recipe_votes 
        WHERE recipe_id = recipe_uuid
    );
END;
$$;


--
-- Name: item_vectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_vectors (
    id integer NOT NULL,
    beer_id uuid,
    wine_id uuid,
    spirit_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    coffee_id uuid,
    updated_at timestamp with time zone DEFAULT now(),
    vector public.halfvec(768),
    sake_id uuid,
    tea_id uuid
);


--
-- Name: calculate_vector_distance(public.item_vectors, public.halfvec); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_vector_distance(item_vector public.item_vectors, search public.halfvec) RETURNS double precision
    LANGUAGE sql STABLE
    AS $$
  SELECT item_vector.vector <=> search
$$;


--
-- Name: count_recipe_downvotes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_recipe_downvotes(recipe_uuid uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM recipe_votes 
        WHERE recipe_id = recipe_uuid AND vote_type = 'downvote'
    );
END;
$$;


--
-- Name: count_recipe_upvotes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_recipe_upvotes(recipe_uuid uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM recipe_votes 
        WHERE recipe_id = recipe_uuid AND vote_type = 'upvote'
    );
END;
$$;


--
-- Name: count_recipes_in_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_recipes_in_group(group_uuid uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM recipes 
        WHERE recipe_group_id = group_uuid
    );
END;
$$;


--
-- Name: create_recipe_with_ingredients(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_recipe_with_ingredients(recipe_name text, recipe_description text DEFAULT NULL::text, recipe_type text DEFAULT 'cocktail'::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_recipe_id UUID;
BEGIN
  INSERT INTO recipes (name, description, type)
  VALUES (recipe_name, recipe_description, recipe_type)
  RETURNING id INTO new_recipe_id;
  
  RETURN new_recipe_id;
END;
$$;


--
-- Name: get_canonical_recipe_calculation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_canonical_recipe_calculation(group_uuid uuid) RETURNS TABLE(recipe_id uuid, recipe_name text, net_score integer, created_at timestamp with time zone, is_current_canonical boolean)
    LANGUAGE plpgsql STABLE
    AS $$
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
$$;


--
-- Name: get_canonical_recipe_for_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_canonical_recipe_for_group(group_uuid uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $$
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
$$;


--
-- Name: get_recipe_vote_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_recipe_vote_summary(recipe_uuid uuid) RETURNS TABLE(recipe_id uuid, upvotes integer, downvotes integer, net_score integer, total_votes integer)
    LANGUAGE plpgsql STABLE
    AS $$
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
$$;


--
-- Name: user_place_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_place_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    place_id uuid NOT NULL,
    is_favorite boolean DEFAULT false,
    is_visited boolean DEFAULT false,
    want_to_visit boolean DEFAULT false,
    rating integer,
    notes text,
    tags text[],
    last_visited_at timestamp with time zone,
    visit_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_place_interactions_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: get_user_favorite_places(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_favorite_places(user_id_param uuid, limit_count integer DEFAULT 50) RETURNS TABLE(place public.places, interaction public.user_place_interactions)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT p, upi
  FROM public.places p
  INNER JOIN public.user_place_interactions upi ON p.id = upi.place_id
  WHERE upi.user_id = user_id_param AND upi.is_favorite = true
  ORDER BY upi.updated_at DESC
  LIMIT limit_count;
END;
$$;


--
-- Name: get_user_vote_for_recipe(uuid, json); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_vote_for_recipe(recipe_uuid uuid, hasura_session json) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
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
$$;


--
-- Name: set_current_timestamp_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trigger_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_category_vectors_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_category_vectors_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_item_image_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_item_image_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_item_vectors_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_item_vectors_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_place_access(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_place_access(place_id uuid, access_reason text DEFAULT 'view'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.places 
  SET 
    access_count = COALESCE(access_count, 0) + 1,
    last_accessed_at = NOW(),
    first_cached_reason = COALESCE(first_cached_reason, access_reason)
  WHERE id = place_id;
END;
$$;


--
-- Name: update_place_vectors_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_place_vectors_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_places_search_text(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_places_search_text() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_text :=
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.categories, ' '), '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.locality, '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: update_recipe_vectors_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_recipe_vectors_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: protect_default_bucket_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_default_bucket_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.ID = 'default' THEN
    RAISE EXCEPTION 'Can not delete default bucket';
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: protect_default_bucket_update(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_default_bucket_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.ID = 'default' AND NEW.ID <> 'default' THEN
    RAISE EXCEPTION 'Can not rename default bucket';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_current_timestamp_updated_at(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _new record;
BEGIN
  _new := new;
  _new. "updated_at" = now();
  RETURN _new;
END;
$$;


--
-- Name: credentials; Type: TABLE; Schema: admin; Owner: -
--

CREATE TABLE admin.credentials (
    id text NOT NULL,
    credentials jsonb NOT NULL
);


--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id uuid NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: api_budget_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_budget_config (
    service text NOT NULL,
    monthly_budget_cents integer DEFAULT 0 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    endpoint text DEFAULT ''::text NOT NULL,
    free_tier_monthly_requests integer DEFAULT 0 NOT NULL
);


--
-- Name: api_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service text NOT NULL,
    endpoint text NOT NULL,
    estimated_cost_cents integer NOT NULL,
    entity_id uuid,
    entity_type text,
    triggered_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: barcodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.barcodes (
    code text NOT NULL,
    type text
);


--
-- Name: beer_style; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beer_style (
    value text CONSTRAINT beer_style_text_not_null NOT NULL,
    comment text
);


--
-- Name: beers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id uuid NOT NULL,
    alcohol_content_percentage numeric,
    international_bitterness_unit integer,
    description text,
    style text,
    vintage date,
    barcode_code text,
    country text,
    item_onboarding_id uuid NOT NULL,
    CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric)))
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    brand_type public.brand_types,
    parent_brand_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: category_vectors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.category_vectors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_vectors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.category_vectors_id_seq OWNED BY public.category_vectors.id;


--
-- Name: cellar_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cellar_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cellar_id uuid NOT NULL,
    created_by uuid NOT NULL,
    wine_id uuid,
    beer_id uuid,
    spirit_id uuid,
    open_at timestamp with time zone,
    empty_at timestamp with time zone,
    display_image_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    percentage_remaining numeric DEFAULT '100'::numeric NOT NULL,
    coffee_id uuid,
    source_type text,
    source_place_id uuid,
    source_menu_item_id uuid,
    sake_id uuid,
    tea_id uuid,
    type text GENERATED ALWAYS AS (
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
    ELSE 'SPIRIT'::text
END) STORED,
    CONSTRAINT "Ensure exactly one item Id" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)),
    CONSTRAINT "Percentage remaining between 0 and 100" CHECK (((percentage_remaining >= (0)::numeric) AND (percentage_remaining <= (100)::numeric))),
    CONSTRAINT cellar_items_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'menu_discovery'::text, 'menu_scan'::text, 'import'::text])))
);


--
-- Name: cellar_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cellar_owners (
    user_id uuid NOT NULL,
    cellar_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cellars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cellars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    created_by_id uuid NOT NULL,
    privacy public.permission_type DEFAULT 'PRIVATE'::public.permission_type NOT NULL
);


--
-- Name: check_ins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_ins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cellar_item_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coffee_cultivar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coffee_cultivar (
    value text CONSTRAINT coffee_cultivar_text_not_null NOT NULL,
    comment text
);


--
-- Name: coffees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coffees (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT coffee_id_not_null NOT NULL,
    name text CONSTRAINT coffee_name_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT coffee_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT coffee_updated_at_not_null NOT NULL,
    created_by_id uuid CONSTRAINT coffee_created_by_id_not_null NOT NULL,
    description text CONSTRAINT coffee_description_not_null NOT NULL,
    roast_level public.coffee_roast_level,
    country text,
    process public.coffee_process,
    barcode_code text,
    item_onboarding_id uuid CONSTRAINT coffee_item_onboarding_id_not_null NOT NULL,
    species public.coffee_species,
    cultivar text
);


--
-- Name: country; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country (
    value text CONSTRAINT country_text_not_null NOT NULL,
    comment text
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket text DEFAULT 'cellar-files'::text NOT NULL,
    key text NOT NULL,
    size integer,
    mime_type text,
    etag text,
    uploaded_by uuid,
    verified_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    status public.friend_request_status NOT NULL
);


--
-- Name: friends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friends (
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: generic_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generic_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    subcategory text,
    item_type text NOT NULL,
    description text,
    is_substitutable boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    CONSTRAINT generic_items_item_type_check CHECK ((item_type = ANY (ARRAY['spirit'::text, 'wine'::text, 'beer'::text, 'coffee'::text, 'ingredient'::text])))
);


--
-- Name: item_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wine_id uuid,
    beer_id uuid,
    spirit_id uuid,
    coffee_id uuid,
    brand_id uuid NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    sake_id uuid,
    tea_id uuid,
    CONSTRAINT exactly_one_item_reference CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1))
);


--
-- Name: item_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    beer_id uuid,
    wine_id uuid,
    spirit_id uuid,
    coffee_id uuid,
    sake_id uuid,
    tea_id uuid,
    type public.item_type GENERATED ALWAYS AS (
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::public.item_type
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::public.item_type
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::public.item_type
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::public.item_type
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::public.item_type
    ELSE 'SPIRIT'::public.item_type
END) STORED NOT NULL,
    CONSTRAINT "Ensure one item_id present" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1))
);


--
-- Name: item_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_image (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    beer_id uuid,
    wine_id uuid,
    spirit_id uuid,
    is_public boolean NOT NULL,
    placeholder text,
    coffee_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sake_id uuid,
    tea_id uuid,
    CONSTRAINT "Ensure at least one item Id" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1))
);


--
-- Name: item_match_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_match_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_menu_item_id uuid NOT NULL,
    suggested_wine_id uuid,
    suggested_beer_id uuid,
    suggested_spirit_id uuid,
    suggested_coffee_id uuid,
    suggested_sake_id uuid,
    suggested_recipe_id uuid,
    confidence_score numeric(3,2) NOT NULL,
    match_reasoning text,
    similarity_metrics jsonb,
    accepted boolean,
    rejected boolean,
    acted_by uuid,
    acted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    suggested_tea_id uuid,
    CONSTRAINT check_single_suggested_item CHECK ((num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id, suggested_sake_id, suggested_tea_id, suggested_recipe_id) = 1))
);


--
-- Name: item_onboardings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_onboardings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'START'::text NOT NULL,
    barcode text,
    barcode_type text,
    front_label_image_id uuid,
    back_label_image_id uuid,
    raw_defaults text,
    defaults jsonb,
    item_type text NOT NULL,
    ai_model text,
    confidence double precision,
    last_reprocess_result jsonb
);


--
-- Name: item_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    score real NOT NULL,
    text json,
    beer_id uuid,
    wine_id uuid,
    spirit_id uuid,
    user_id uuid NOT NULL,
    coffee_id uuid,
    sake_id uuid,
    tea_id uuid,
    CONSTRAINT "Ensure one item_id present" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)),
    CONSTRAINT "Score in allowed values" CHECK ((score = ANY (ARRAY[(0.5)::double precision, ((1)::numeric)::double precision, (1.5)::double precision, ((2)::numeric)::double precision, (2.5)::double precision, ((3)::numeric)::double precision, (3.5)::double precision, ((4)::numeric)::double precision, (4.5)::double precision, ((5)::numeric)::double precision])))
);


--
-- Name: item_vectors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.item_vectors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: item_vectors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.item_vectors_id_seq OWNED BY public.item_vectors.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    cursor jsonb,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    total integer,
    processed integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    cancel_requested boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: jwks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jwks (
    id uuid NOT NULL,
    public_key text NOT NULL,
    private_key text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone,
    alg text,
    crv text
);


--
-- Name: menu_item_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_item_id uuid NOT NULL,
    recipe_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: menu_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    place_id uuid,
    original_image_id uuid NOT NULL,
    processed_image_id uuid,
    extracted_text text,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    processing_error text,
    confidence_score numeric(3,2),
    scan_location public.geography(Point,4326),
    estimated_place_id uuid,
    manual_place_override uuid,
    processing_model text,
    processing_duration_ms integer,
    items_detected integer DEFAULT 0,
    items_matched integer DEFAULT 0,
    scanned_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT menu_scans_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seq bigint NOT NULL,
    target_actor text NOT NULL,
    target_id text NOT NULL,
    method text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_after timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_token uuid,
    attributed_to uuid,
    CONSTRAINT outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivering'::text, 'delivered'::text, 'dead'::text])))
);


--
-- Name: outbox_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_seq_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_seq_seq OWNED BY public.outbox.seq;


--
-- Name: place_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    relationship_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT place_brands_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['owned_by'::text, 'affiliated_with'::text, 'serves'::text])))
);


--
-- Name: place_google_enrichments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_google_enrichments (
    place_id uuid NOT NULL,
    google_place_id text NOT NULL,
    google_name text,
    google_formatted_address text,
    google_rating real,
    google_user_ratings_total integer,
    google_price_level integer,
    google_website text,
    google_phone text,
    google_opening_hours jsonb,
    google_types text[],
    google_business_status text,
    google_editorial_summary text,
    photo_references jsonb DEFAULT '[]'::jsonb,
    attributions jsonb DEFAULT '[]'::jsonb,
    resolved_via text NOT NULL,
    details_fetched_at timestamp with time zone,
    photos_fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT place_google_enrichments_resolved_via_check CHECK ((resolved_via = ANY (ARRAY['nearby_search'::text, 'autocomplete'::text, 'text_search'::text])))
);


--
-- Name: place_google_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_google_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    google_photo_name text NOT NULL,
    storage_file_id uuid,
    width integer,
    height integer,
    attributions jsonb DEFAULT '[]'::jsonb NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: place_menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_menu_id uuid,
    menu_scan_id uuid,
    place_id uuid NOT NULL,
    menu_item_name text NOT NULL,
    menu_item_description text,
    menu_item_price numeric(10,2),
    menu_category text,
    detected_item_type text,
    confidence_score numeric(3,2),
    extracted_attributes jsonb,
    wine_id uuid,
    beer_id uuid,
    spirit_id uuid,
    coffee_id uuid,
    match_verified_by uuid,
    match_verified_at timestamp with time zone,
    is_available boolean DEFAULT true,
    seasonal boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_menu_or_scan_source CHECK ((num_nonnulls(place_menu_id, menu_scan_id) = 1)),
    CONSTRAINT check_single_item_type CHECK ((num_nonnulls(wine_id, beer_id, spirit_id, coffee_id) <= 1)),
    CONSTRAINT place_menu_items_detected_item_type_check CHECK ((detected_item_type = ANY (ARRAY['wine'::text, 'beer'::text, 'spirit'::text, 'coffee'::text, 'sake'::text, 'tea'::text, 'cocktail'::text, 'unknown'::text])))
);


--
-- Name: place_menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    menu_data jsonb NOT NULL,
    menu_type text,
    source text NOT NULL,
    source_url text,
    discovery_method text,
    confidence_score numeric(3,2),
    version integer DEFAULT 1,
    is_current boolean DEFAULT true,
    valid_from timestamp with time zone DEFAULT now(),
    valid_until timestamp with time zone,
    created_by uuid,
    verified_by uuid,
    discovered_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT place_menus_menu_type_check CHECK ((menu_type = ANY (ARRAY['food'::text, 'drinks'::text, 'wine'::text, 'beer'::text, 'cocktails'::text, 'coffee'::text]))),
    CONSTRAINT place_menus_source_check CHECK ((source = ANY (ARRAY['web_scrape'::text, 'api'::text, 'user_upload'::text, 'ai_generated'::text, 'camera_scan'::text])))
);


--
-- Name: place_vectors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.place_vectors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: place_vectors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.place_vectors_id_seq OWNED BY public.place_vectors.id;


--
-- Name: recipe_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category public.recipe_category NOT NULL,
    base_spirit text,
    tags text[],
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    canonical_recipe_id uuid,
    CONSTRAINT recipe_groups_name_check CHECK ((length(name) > 0))
);


--
-- Name: recipe_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    wine_id uuid,
    beer_id uuid,
    spirit_id uuid,
    coffee_id uuid,
    generic_item_id uuid,
    quantity numeric,
    unit text,
    is_optional boolean DEFAULT false,
    substitution_notes text,
    created_at timestamp with time zone DEFAULT now(),
    sake_id uuid,
    tea_id uuid,
    CONSTRAINT exactly_one_item_reference CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id, generic_item_id) = 1))
);


--
-- Name: recipe_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_instructions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    step_number integer NOT NULL,
    instruction_text text NOT NULL,
    instruction_type public.instruction_types,
    equipment_needed text,
    time_minutes integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: recipe_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    user_id uuid NOT NULL,
    score real,
    text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipe_reviews_score_range CHECK (((score IS NULL) OR (score = ANY (ARRAY[(0.5)::double precision, ((1)::numeric)::double precision, (1.5)::double precision, ((2)::numeric)::double precision, (2.5)::double precision, ((3)::numeric)::double precision, (3.5)::double precision, ((4)::numeric)::double precision, (4.5)::double precision, ((5)::numeric)::double precision]))))
);


--
-- Name: recipe_vectors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recipe_vectors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recipe_vectors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recipe_vectors_id_seq OWNED BY public.recipe_vectors.id;


--
-- Name: recipe_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    user_id uuid NOT NULL,
    vote_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recipe_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['upvote'::text, 'downvote'::text])))
);


--
-- Name: recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    type text NOT NULL,
    canonical_recipe_id uuid,
    difficulty_level integer,
    prep_time_minutes integer,
    serving_size integer,
    image_url text,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    recipe_group_id uuid,
    created_by_id uuid,
    CONSTRAINT recipes_difficulty_level_check CHECK (((difficulty_level >= 1) AND (difficulty_level <= 5))),
    CONSTRAINT recipes_type_check CHECK ((type = ANY (ARRAY['food'::text, 'cocktail'::text])))
);


--
-- Name: sake_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sake_category (
    value text NOT NULL,
    comment text
);


--
-- Name: sake_rice_variety; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sake_rice_variety (
    value text NOT NULL,
    comment text
);


--
-- Name: sake_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sake_type (
    value text NOT NULL,
    comment text
);


--
-- Name: sakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    region text,
    category text,
    type text,
    polish_grade numeric(4,2),
    alcohol_content_percentage numeric(4,2),
    serving_temperature public.sake_serving_temperature,
    rice_variety text,
    yeast_strain text,
    sake_meter_value numeric(4,2),
    acidity numeric(4,2),
    amino_acid numeric(4,2),
    vintage integer,
    country text,
    barcode_code text,
    item_onboarding_id uuid
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id uuid NOT NULL
);


--
-- Name: spirit_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spirit_type (
    value text CONSTRAINT spirit_type_text_not_null NOT NULL,
    comment text
);


--
-- Name: spirits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spirits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id uuid NOT NULL,
    type text NOT NULL,
    vintage date,
    description text,
    alcohol_content_percentage numeric,
    style text,
    barcode_code text,
    country text,
    item_onboarding_id uuid NOT NULL,
    CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric)))
);


--
-- Name: tea_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tea_category (
    value text NOT NULL,
    comment text
);


--
-- Name: teas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    category text,
    form public.tea_form,
    caffeine_level public.tea_caffeine_level,
    region text,
    country text,
    cultivar text,
    oxidation_level text,
    processing text,
    harvest_year integer,
    ingredients text,
    steeping_temperature text,
    steeping_time text,
    flavor_profile text,
    is_organic boolean,
    is_fair_trade boolean,
    barcode_code text,
    item_onboarding_id uuid
);


--
-- Name: tier_list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_list_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tier_list_id uuid NOT NULL,
    band integer DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    notes text,
    place_id uuid,
    wine_id uuid,
    beer_id uuid,
    spirit_id uuid,
    coffee_id uuid,
    sake_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tea_id uuid,
    type text GENERATED ALWAYS AS (
CASE
    WHEN (place_id IS NOT NULL) THEN 'PLACE'::text
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
    WHEN (spirit_id IS NOT NULL) THEN 'SPIRIT'::text
    ELSE NULL::text
END) STORED,
    CONSTRAINT exactly_one_tier_item_reference CHECK ((num_nonnulls(place_id, wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) = 1)),
    CONSTRAINT tier_list_items_band_check CHECK (((band >= 0) AND (band <= 5)))
);


--
-- Name: tier_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by_id uuid NOT NULL,
    privacy public.permission_type DEFAULT 'PRIVATE'::public.permission_type NOT NULL,
    list_type text DEFAULT 'place'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    content_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_insights jsonb,
    insights_generated_at timestamp with time zone,
    is_editing_locked boolean DEFAULT false NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    locale text,
    disabled boolean DEFAULT false NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id uuid NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wine_style; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wine_style (
    value text CONSTRAINT wine_type_text_not_null NOT NULL,
    comment text
);


--
-- Name: wine_variety; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wine_variety (
    value text CONSTRAINT wine_variety_text_not_null NOT NULL,
    comment text
);


--
-- Name: wines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id uuid NOT NULL,
    vintage date NOT NULL,
    variety text,
    region text,
    winery_id uuid,
    description text,
    special_designation text,
    vineyard_designation text,
    alcohol_content_percentage numeric,
    barcode_code text,
    style text NOT NULL,
    country text,
    item_onboarding_id uuid NOT NULL,
    CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric)))
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    download_expiration integer DEFAULT 30 NOT NULL,
    min_upload_file_size integer DEFAULT 1 NOT NULL,
    max_upload_file_size integer DEFAULT 50000000 NOT NULL,
    cache_control text DEFAULT 'max-age=3600'::text,
    presigned_urls_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT download_expiration_valid_range CHECK (((download_expiration >= 1) AND (download_expiration <= 604800)))
);


--
-- Name: files; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.files (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bucket_id text DEFAULT 'default'::text NOT NULL,
    name text,
    size integer,
    mime_type text,
    etag text,
    is_uploaded boolean DEFAULT false,
    uploaded_by_user_id uuid,
    metadata jsonb
);


--
-- Name: schema_migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


--
-- Name: virus; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.virus (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    file_id uuid NOT NULL,
    filename text NOT NULL,
    virus text NOT NULL,
    user_session jsonb NOT NULL
);


--
-- Name: category_vectors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_vectors ALTER COLUMN id SET DEFAULT nextval('public.category_vectors_id_seq'::regclass);


--
-- Name: item_vectors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors ALTER COLUMN id SET DEFAULT nextval('public.item_vectors_id_seq'::regclass);


--
-- Name: outbox seq; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox ALTER COLUMN seq SET DEFAULT nextval('public.outbox_seq_seq'::regclass);


--
-- Name: place_vectors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_vectors ALTER COLUMN id SET DEFAULT nextval('public.place_vectors_id_seq'::regclass);


--
-- Name: recipe_vectors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_vectors ALTER COLUMN id SET DEFAULT nextval('public.recipe_vectors_id_seq'::regclass);


--
-- Name: credentials credentials_pkey; Type: CONSTRAINT; Schema: admin; Owner: -
--

ALTER TABLE ONLY admin.credentials
    ADD CONSTRAINT credentials_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: api_budget_config api_budget_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_budget_config
    ADD CONSTRAINT api_budget_config_pkey PRIMARY KEY (service, endpoint);


--
-- Name: api_usage_log api_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_usage_log
    ADD CONSTRAINT api_usage_log_pkey PRIMARY KEY (id);


--
-- Name: barcodes barcodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.barcodes
    ADD CONSTRAINT barcodes_pkey PRIMARY KEY (code);


--
-- Name: beer_style beer_style_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beer_style
    ADD CONSTRAINT beer_style_pkey PRIMARY KEY (value);


--
-- Name: beers beers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: category_vectors category_vectors_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_vectors
    ADD CONSTRAINT category_vectors_label_key UNIQUE (label);


--
-- Name: category_vectors category_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_vectors
    ADD CONSTRAINT category_vectors_pkey PRIMARY KEY (id);


--
-- Name: cellar_items cellar_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_pkey PRIMARY KEY (id);


--
-- Name: cellar_owners cellar_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_owners
    ADD CONSTRAINT cellar_owners_pkey PRIMARY KEY (user_id, cellar_id);


--
-- Name: cellars cellars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellars
    ADD CONSTRAINT cellars_pkey PRIMARY KEY (id);


--
-- Name: check_ins check_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_pkey PRIMARY KEY (id);


--
-- Name: coffee_cultivar coffee_cultivar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffee_cultivar
    ADD CONSTRAINT coffee_cultivar_pkey PRIMARY KEY (value);


--
-- Name: coffees coffees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_pkey PRIMARY KEY (id);


--
-- Name: country country_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_pkey PRIMARY KEY (value);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_user_id_friend_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_user_id_friend_id_key UNIQUE (user_id, friend_id);


--
-- Name: friends friends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_pkey PRIMARY KEY (user_id, friend_id);


--
-- Name: generic_items generic_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generic_items
    ADD CONSTRAINT generic_items_pkey PRIMARY KEY (id);


--
-- Name: generic_items idx_generic_items_name_category; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generic_items
    ADD CONSTRAINT idx_generic_items_name_category UNIQUE (name, category);


--
-- Name: item_brands item_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_pkey PRIMARY KEY (id);


--
-- Name: item_favorites item_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_pkey PRIMARY KEY (id);


--
-- Name: item_favorites item_favorites_user_id_beer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_beer_id_key UNIQUE (user_id, beer_id);


--
-- Name: item_favorites item_favorites_user_id_coffee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_coffee_id_key UNIQUE (user_id, coffee_id);


--
-- Name: item_favorites item_favorites_user_id_sake_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_sake_id_key UNIQUE (user_id, sake_id);


--
-- Name: item_favorites item_favorites_user_id_spirit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_spirit_id_key UNIQUE (user_id, spirit_id);


--
-- Name: item_favorites item_favorites_user_id_tea_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_tea_id_key UNIQUE (user_id, tea_id);


--
-- Name: item_favorites item_favorites_user_id_wine_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_wine_id_key UNIQUE (user_id, wine_id);


--
-- Name: item_image item_image_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_pkey PRIMARY KEY (id);


--
-- Name: item_match_suggestions item_match_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_pkey PRIMARY KEY (id);


--
-- Name: item_onboardings item_onboardings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_pkey PRIMARY KEY (id);


--
-- Name: item_reviews item_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_pkey PRIMARY KEY (id);


--
-- Name: item_vectors item_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


--
-- Name: menu_item_recipes menu_item_recipes_menu_item_id_recipe_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_recipes
    ADD CONSTRAINT menu_item_recipes_menu_item_id_recipe_id_key UNIQUE (menu_item_id, recipe_id);


--
-- Name: menu_item_recipes menu_item_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_recipes
    ADD CONSTRAINT menu_item_recipes_pkey PRIMARY KEY (id);


--
-- Name: menu_scans menu_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_pkey PRIMARY KEY (id);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (id);


--
-- Name: place_brands place_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_brands
    ADD CONSTRAINT place_brands_pkey PRIMARY KEY (id);


--
-- Name: place_brands place_brands_place_id_brand_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_brands
    ADD CONSTRAINT place_brands_place_id_brand_id_key UNIQUE (place_id, brand_id);


--
-- Name: place_google_enrichments place_google_enrichments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_enrichments
    ADD CONSTRAINT place_google_enrichments_pkey PRIMARY KEY (place_id);


--
-- Name: place_google_photos place_google_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_photos
    ADD CONSTRAINT place_google_photos_pkey PRIMARY KEY (id);


--
-- Name: place_menu_items place_menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_pkey PRIMARY KEY (id);


--
-- Name: place_menus place_menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_pkey PRIMARY KEY (id);


--
-- Name: place_vectors place_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_vectors
    ADD CONSTRAINT place_vectors_pkey PRIMARY KEY (id);


--
-- Name: places places_overture_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_overture_id_key UNIQUE (overture_id);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: recipe_groups recipe_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_groups
    ADD CONSTRAINT recipe_groups_pkey PRIMARY KEY (id);


--
-- Name: recipe_ingredients recipe_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id);


--
-- Name: recipe_instructions recipe_instructions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_instructions
    ADD CONSTRAINT recipe_instructions_pkey PRIMARY KEY (id);


--
-- Name: recipe_instructions recipe_instructions_recipe_id_step_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_instructions
    ADD CONSTRAINT recipe_instructions_recipe_id_step_number_key UNIQUE (recipe_id, step_number);


--
-- Name: recipe_reviews recipe_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_reviews
    ADD CONSTRAINT recipe_reviews_pkey PRIMARY KEY (id);


--
-- Name: recipe_reviews recipe_reviews_unique_user_recipe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_reviews
    ADD CONSTRAINT recipe_reviews_unique_user_recipe UNIQUE (recipe_id, user_id);


--
-- Name: recipe_vectors recipe_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_vectors
    ADD CONSTRAINT recipe_vectors_pkey PRIMARY KEY (id);


--
-- Name: recipe_votes recipe_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_votes
    ADD CONSTRAINT recipe_votes_pkey PRIMARY KEY (id);


--
-- Name: recipe_votes recipe_votes_recipe_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_votes
    ADD CONSTRAINT recipe_votes_recipe_id_user_id_key UNIQUE (recipe_id, user_id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: sake_category sake_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sake_category
    ADD CONSTRAINT sake_category_pkey PRIMARY KEY (value);


--
-- Name: sake_rice_variety sake_rice_variety_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sake_rice_variety
    ADD CONSTRAINT sake_rice_variety_pkey PRIMARY KEY (value);


--
-- Name: sake_type sake_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sake_type
    ADD CONSTRAINT sake_type_pkey PRIMARY KEY (value);


--
-- Name: sakes sakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: spirit_type spirit_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirit_type
    ADD CONSTRAINT spirit_type_pkey PRIMARY KEY (value);


--
-- Name: spirits spirits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_pkey PRIMARY KEY (id);


--
-- Name: tea_category tea_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tea_category
    ADD CONSTRAINT tea_category_pkey PRIMARY KEY (value);


--
-- Name: teas teas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_pkey PRIMARY KEY (id);


--
-- Name: tier_list_items tier_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_pkey PRIMARY KEY (id);


--
-- Name: tier_lists tier_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_pkey PRIMARY KEY (id);


--
-- Name: tier_list_items unique_beer_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_beer_in_tier_list UNIQUE (tier_list_id, beer_id);


--
-- Name: tier_list_items unique_coffee_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_coffee_in_tier_list UNIQUE (tier_list_id, coffee_id);


--
-- Name: tier_list_items unique_place_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_place_in_tier_list UNIQUE (tier_list_id, place_id);


--
-- Name: tier_list_items unique_sake_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_sake_in_tier_list UNIQUE (tier_list_id, sake_id);


--
-- Name: tier_list_items unique_spirit_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_spirit_in_tier_list UNIQUE (tier_list_id, spirit_id);


--
-- Name: tier_list_items unique_tea_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_tea_in_tier_list UNIQUE (tier_list_id, tea_id);


--
-- Name: user_place_interactions unique_user_place; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT unique_user_place UNIQUE (user_id, place_id);


--
-- Name: tier_list_items unique_wine_in_tier_list; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT unique_wine_in_tier_list UNIQUE (tier_list_id, wine_id);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: user_place_interactions user_place_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT user_place_interactions_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: wine_style wine_style_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wine_style
    ADD CONSTRAINT wine_style_pkey PRIMARY KEY (value);


--
-- Name: wine_variety wine_variety_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wine_variety
    ADD CONSTRAINT wine_variety_pkey PRIMARY KEY (value);


--
-- Name: wines wines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: virus virus_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.virus
    ADD CONSTRAINT virus_pkey PRIMARY KEY (id);


--
-- Name: account_provider_account_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_provider_account_key ON public.account USING btree (provider_id, account_id);


--
-- Name: account_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_user_id_idx ON public.account USING btree (user_id);


--
-- Name: brands_unique_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brands_unique_lower_name ON public.brands USING btree (lower(name));


--
-- Name: files_bucket_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX files_bucket_key_idx ON public.files USING btree (bucket, key);


--
-- Name: files_unverified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_unverified_idx ON public.files USING btree (created_at) WHERE (verified_at IS NULL);


--
-- Name: idx_api_usage_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_usage_log_created_at ON public.api_usage_log USING btree (created_at);


--
-- Name: idx_api_usage_log_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_usage_log_reservation_id ON public.api_usage_log USING btree (((metadata ->> 'reservationId'::text))) WHERE ((metadata ->> 'reservationId'::text) IS NOT NULL);


--
-- Name: idx_api_usage_log_service_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_usage_log_service_created ON public.api_usage_log USING btree (service, created_at);


--
-- Name: idx_brands_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_name ON public.brands USING btree (name);


--
-- Name: idx_brands_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_name_trgm ON public.brands USING gin (name public.gin_trgm_ops);


--
-- Name: idx_brands_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_parent ON public.brands USING btree (parent_brand_id);


--
-- Name: idx_brands_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_type ON public.brands USING btree (brand_type);


--
-- Name: idx_category_vectors_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_category_vectors_hnsw ON public.category_vectors USING hnsw (vector public.halfvec_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_category_vectors_label_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_category_vectors_label_type ON public.category_vectors USING btree (label_type);


--
-- Name: idx_cellar_items_cellar_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cellar_items_cellar_id ON public.cellar_items USING btree (cellar_id);


--
-- Name: idx_cellar_items_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cellar_items_sake_id ON public.cellar_items USING btree (sake_id);


--
-- Name: idx_cellar_items_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cellar_items_tea_id ON public.cellar_items USING btree (tea_id);


--
-- Name: idx_cellar_owners_cellar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cellar_owners_cellar ON public.cellar_owners USING btree (cellar_id, user_id);


--
-- Name: idx_cellars_created_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cellars_created_by_id ON public.cellars USING btree (created_by_id);


--
-- Name: idx_cellars_privacy_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cellars_privacy_public ON public.cellars USING btree (id) WHERE (privacy = 'PUBLIC'::public.permission_type);


--
-- Name: idx_friends_friend_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friends_friend_user ON public.friends USING btree (friend_id, user_id);


--
-- Name: idx_generic_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generic_items_category ON public.generic_items USING btree (category);


--
-- Name: idx_generic_items_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generic_items_created_by ON public.generic_items USING btree (created_by_id);


--
-- Name: idx_generic_items_item_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generic_items_item_type ON public.generic_items USING btree (item_type);


--
-- Name: idx_item_brands_beer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_beer_id ON public.item_brands USING btree (beer_id);


--
-- Name: idx_item_brands_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_brand_id ON public.item_brands USING btree (brand_id);


--
-- Name: idx_item_brands_coffee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_coffee_id ON public.item_brands USING btree (coffee_id);


--
-- Name: idx_item_brands_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_sake_id ON public.item_brands USING btree (sake_id);


--
-- Name: idx_item_brands_spirit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_spirit_id ON public.item_brands USING btree (spirit_id);


--
-- Name: idx_item_brands_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_tea_id ON public.item_brands USING btree (tea_id);


--
-- Name: idx_item_brands_wine_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_brands_wine_id ON public.item_brands USING btree (wine_id);


--
-- Name: idx_item_favorites_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_favorites_sake_id ON public.item_favorites USING btree (sake_id);


--
-- Name: idx_item_favorites_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_favorites_tea_id ON public.item_favorites USING btree (tea_id);


--
-- Name: idx_item_image_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_image_sake_id ON public.item_image USING btree (sake_id);


--
-- Name: idx_item_image_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_image_tea_id ON public.item_image USING btree (tea_id);


--
-- Name: idx_item_match_suggestions_suggested_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_match_suggestions_suggested_tea_id ON public.item_match_suggestions USING btree (suggested_tea_id);


--
-- Name: idx_item_reviews_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_reviews_sake_id ON public.item_reviews USING btree (sake_id);


--
-- Name: idx_item_reviews_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_reviews_tea_id ON public.item_reviews USING btree (tea_id);


--
-- Name: idx_item_vectors_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_vectors_sake_id ON public.item_vectors USING btree (sake_id);


--
-- Name: idx_item_vectors_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_vectors_tea_id ON public.item_vectors USING btree (tea_id);


--
-- Name: idx_match_suggestions_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_match_suggestions_pending ON public.item_match_suggestions USING btree (place_menu_item_id) WHERE ((accepted IS NULL) AND (rejected IS NULL));


--
-- Name: idx_menu_item_recipes_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_recipes_menu_item_id ON public.menu_item_recipes USING btree (menu_item_id);


--
-- Name: idx_menu_item_recipes_recipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_recipes_recipe_id ON public.menu_item_recipes USING btree (recipe_id);


--
-- Name: idx_menu_scans_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_scans_location ON public.menu_scans USING gist (scan_location);


--
-- Name: idx_menu_scans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_scans_status ON public.menu_scans USING btree (processing_status);


--
-- Name: idx_menu_scans_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_scans_user ON public.menu_scans USING btree (user_id);


--
-- Name: idx_pge_details_fetched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pge_details_fetched_at ON public.place_google_enrichments USING btree (details_fetched_at);


--
-- Name: idx_pge_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pge_google_place_id ON public.place_google_enrichments USING btree (google_place_id);


--
-- Name: idx_pgp_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pgp_place_id ON public.place_google_photos USING btree (place_id);


--
-- Name: idx_place_brands_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_brands_brand_id ON public.place_brands USING btree (brand_id);


--
-- Name: idx_place_brands_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_brands_place_id ON public.place_brands USING btree (place_id);


--
-- Name: idx_place_menu_items_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menu_items_menu ON public.place_menu_items USING btree (place_menu_id);


--
-- Name: idx_place_menu_items_place; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menu_items_place ON public.place_menu_items USING btree (place_id);


--
-- Name: idx_place_menu_items_scan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menu_items_scan ON public.place_menu_items USING btree (menu_scan_id);


--
-- Name: idx_place_menu_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menu_items_type ON public.place_menu_items USING btree (detected_item_type);


--
-- Name: idx_place_menu_items_unmatched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menu_items_unmatched ON public.place_menu_items USING btree (wine_id, beer_id, spirit_id, coffee_id) WHERE ((wine_id IS NULL) AND (beer_id IS NULL) AND (spirit_id IS NULL) AND (coffee_id IS NULL));


--
-- Name: idx_place_menus_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menus_current ON public.place_menus USING btree (place_id, is_current) WHERE (is_current = true);


--
-- Name: idx_place_menus_current_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_place_menus_current_unique ON public.place_menus USING btree (place_id, menu_type) WHERE (is_current = true);


--
-- Name: idx_place_menus_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menus_place_id ON public.place_menus USING btree (place_id);


--
-- Name: idx_place_menus_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_menus_type ON public.place_menus USING btree (menu_type);


--
-- Name: idx_place_vectors_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_vectors_hnsw ON public.place_vectors USING hnsw (vector public.halfvec_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_place_vectors_hnsw_l2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_vectors_hnsw_l2 ON public.place_vectors USING hnsw (vector public.halfvec_l2_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_place_vectors_place_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_vectors_place_created ON public.place_vectors USING btree (place_id, created_at);


--
-- Name: idx_place_vectors_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_vectors_place_id ON public.place_vectors USING btree (place_id);


--
-- Name: idx_places_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_categories ON public.places USING gin (categories);


--
-- Name: idx_places_created_by_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_created_by_created_at ON public.places USING btree (created_by, created_at DESC);


--
-- Name: idx_places_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_places_google_place_id ON public.places USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);


--
-- Name: idx_places_locality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_locality ON public.places USING btree (locality);


--
-- Name: idx_places_locality_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_locality_trgm ON public.places USING gin (locality public.gin_trgm_ops);


--
-- Name: idx_places_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_location ON public.places USING gist (location);

ALTER TABLE public.places CLUSTER ON idx_places_location;


--
-- Name: idx_places_name_compact_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_name_compact_trgm ON public.places USING gin (regexp_replace(lower(name), '[^a-z0-9]'::text, ''::text, 'g'::text) public.gin_trgm_ops);


--
-- Name: idx_places_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_name_trgm ON public.places USING gin (name public.gin_trgm_ops);


--
-- Name: idx_places_primary_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_primary_category ON public.places USING btree (primary_category);


--
-- Name: idx_places_search_text; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_search_text ON public.places USING gin (search_text);


--
-- Name: idx_recipe_groups_base_spirit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_groups_base_spirit ON public.recipe_groups USING btree (base_spirit);


--
-- Name: idx_recipe_groups_canonical_recipe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_groups_canonical_recipe ON public.recipe_groups USING btree (canonical_recipe_id);


--
-- Name: idx_recipe_groups_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_groups_category ON public.recipe_groups USING btree (category);


--
-- Name: idx_recipe_groups_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_groups_created_by ON public.recipe_groups USING btree (created_by_id);


--
-- Name: idx_recipe_groups_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_groups_tags ON public.recipe_groups USING gin (tags);


--
-- Name: idx_recipe_ingredients_beer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_beer_id ON public.recipe_ingredients USING btree (beer_id);


--
-- Name: idx_recipe_ingredients_coffee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_coffee_id ON public.recipe_ingredients USING btree (coffee_id);


--
-- Name: idx_recipe_ingredients_generic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_generic_id ON public.recipe_ingredients USING btree (generic_item_id);


--
-- Name: idx_recipe_ingredients_recipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_recipe_id ON public.recipe_ingredients USING btree (recipe_id);


--
-- Name: idx_recipe_ingredients_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_sake_id ON public.recipe_ingredients USING btree (sake_id);


--
-- Name: idx_recipe_ingredients_spirit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_spirit_id ON public.recipe_ingredients USING btree (spirit_id);


--
-- Name: idx_recipe_ingredients_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_tea_id ON public.recipe_ingredients USING btree (tea_id);


--
-- Name: idx_recipe_ingredients_wine_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_ingredients_wine_id ON public.recipe_ingredients USING btree (wine_id);


--
-- Name: idx_recipe_instructions_recipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_instructions_recipe_id ON public.recipe_instructions USING btree (recipe_id);


--
-- Name: idx_recipe_instructions_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_instructions_step ON public.recipe_instructions USING btree (recipe_id, step_number);


--
-- Name: idx_recipe_instructions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_instructions_type ON public.recipe_instructions USING btree (instruction_type);


--
-- Name: idx_recipe_reviews_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_reviews_created_at ON public.recipe_reviews USING btree (created_at);


--
-- Name: idx_recipe_reviews_recipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_reviews_recipe_id ON public.recipe_reviews USING btree (recipe_id);


--
-- Name: idx_recipe_reviews_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_reviews_score ON public.recipe_reviews USING btree (score);


--
-- Name: idx_recipe_reviews_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_reviews_user_id ON public.recipe_reviews USING btree (user_id);


--
-- Name: idx_recipe_vectors_hnsw_cosine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_vectors_hnsw_cosine ON public.recipe_vectors USING hnsw (vector public.halfvec_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_recipe_vectors_hnsw_l2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_vectors_hnsw_l2 ON public.recipe_vectors USING hnsw (vector public.halfvec_l2_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_recipe_vectors_recipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_vectors_recipe_id ON public.recipe_vectors USING btree (recipe_id);


--
-- Name: idx_recipe_votes_recipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_votes_recipe_id ON public.recipe_votes USING btree (recipe_id);


--
-- Name: idx_recipe_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_votes_user_id ON public.recipe_votes USING btree (user_id);


--
-- Name: idx_recipe_votes_vote_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipe_votes_vote_type ON public.recipe_votes USING btree (vote_type);


--
-- Name: idx_recipes_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_canonical ON public.recipes USING btree (canonical_recipe_id);


--
-- Name: idx_recipes_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_created_by ON public.recipes USING btree (created_by_id);


--
-- Name: idx_recipes_difficulty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_difficulty ON public.recipes USING btree (difficulty_level);


--
-- Name: idx_recipes_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_group_id ON public.recipes USING btree (recipe_group_id);


--
-- Name: idx_recipes_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_name ON public.recipes USING btree (name);


--
-- Name: idx_recipes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_type ON public.recipes USING btree (type);


--
-- Name: idx_sakes_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_category ON public.sakes USING btree (category);


--
-- Name: idx_sakes_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_created_by ON public.sakes USING btree (created_by_id);


--
-- Name: idx_sakes_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_name ON public.sakes USING btree (name);


--
-- Name: idx_sakes_polish_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_polish_grade ON public.sakes USING btree (polish_grade);


--
-- Name: idx_sakes_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_region ON public.sakes USING btree (region);


--
-- Name: idx_sakes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_type ON public.sakes USING btree (type);


--
-- Name: idx_sakes_vintage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sakes_vintage ON public.sakes USING btree (vintage);


--
-- Name: idx_teas_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teas_category ON public.teas USING btree (category);


--
-- Name: idx_teas_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teas_created_by ON public.teas USING btree (created_by_id);


--
-- Name: idx_teas_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teas_name ON public.teas USING btree (name);


--
-- Name: idx_teas_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teas_region ON public.teas USING btree (region);


--
-- Name: idx_tier_list_items_beer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_beer_id ON public.tier_list_items USING btree (beer_id) WHERE (beer_id IS NOT NULL);


--
-- Name: idx_tier_list_items_coffee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_coffee_id ON public.tier_list_items USING btree (coffee_id) WHERE (coffee_id IS NOT NULL);


--
-- Name: idx_tier_list_items_place_id_tier_list_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_place_id_tier_list_id ON public.tier_list_items USING btree (place_id, tier_list_id);


--
-- Name: idx_tier_list_items_sake_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_sake_id ON public.tier_list_items USING btree (sake_id) WHERE (sake_id IS NOT NULL);


--
-- Name: idx_tier_list_items_spirit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_spirit_id ON public.tier_list_items USING btree (spirit_id) WHERE (spirit_id IS NOT NULL);


--
-- Name: idx_tier_list_items_tea_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_tea_id ON public.tier_list_items USING btree (tea_id) WHERE (tea_id IS NOT NULL);


--
-- Name: idx_tier_list_items_wine_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_list_items_wine_id ON public.tier_list_items USING btree (wine_id) WHERE (wine_id IS NOT NULL);


--
-- Name: idx_user_place_interactions_favorites; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_place_interactions_favorites ON public.user_place_interactions USING btree (user_id, is_favorite) WHERE (is_favorite = true);


--
-- Name: idx_user_place_interactions_place; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_place_interactions_place ON public.user_place_interactions USING btree (place_id);


--
-- Name: idx_user_place_interactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_place_interactions_user ON public.user_place_interactions USING btree (user_id);


--
-- Name: idx_user_place_interactions_visited; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_place_interactions_visited ON public.user_place_interactions USING btree (user_id, is_visited) WHERE (is_visited = true);


--
-- Name: idx_user_place_interactions_want_to_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_place_interactions_want_to_visit ON public.user_place_interactions USING btree (user_id, want_to_visit) WHERE (want_to_visit = true);


--
-- Name: item_vectors_vector_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_vectors_vector_hnsw_idx ON public.item_vectors USING hnsw (vector public.halfvec_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: item_vectors_vector_hnsw_l2_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_vectors_vector_hnsw_l2_idx ON public.item_vectors USING hnsw (vector public.halfvec_l2_ops) WITH (m='16', ef_construction='64');


--
-- Name: jobs_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_kind_status_idx ON public.jobs USING btree (kind, status);


--
-- Name: outbox_delivering_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_delivering_idx ON public.outbox USING btree (updated_at) WHERE (status = 'delivering'::text);


--
-- Name: outbox_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_due_idx ON public.outbox USING btree (run_after, seq) WHERE (status = 'pending'::text);


--
-- Name: outbox_live_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_live_target_idx ON public.outbox USING btree (target_actor, target_id, method) WHERE ((status = 'pending'::text) OR (status = 'delivering'::text));


--
-- Name: places_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX places_created_by_idx ON public.places USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: places_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX places_source_idx ON public.places USING btree (source);


--
-- Name: session_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_token_key ON public.session USING btree (token);


--
-- Name: session_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_user_id_idx ON public.session USING btree (user_id);


--
-- Name: tier_list_items_place_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tier_list_items_place_id_idx ON public.tier_list_items USING btree (place_id);


--
-- Name: tier_list_items_tier_list_id_band_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tier_list_items_tier_list_id_band_position_idx ON public.tier_list_items USING btree (tier_list_id, band DESC, "position");


--
-- Name: tier_list_items_tier_list_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tier_list_items_tier_list_id_idx ON public.tier_list_items USING btree (tier_list_id);


--
-- Name: tier_lists_created_by_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tier_lists_created_by_id_idx ON public.tier_lists USING btree (created_by_id);


--
-- Name: tier_lists_privacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tier_lists_privacy_idx ON public.tier_lists USING btree (privacy);


--
-- Name: unique_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_google_place_id ON public.place_google_enrichments USING btree (google_place_id);


--
-- Name: unique_place_photo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_place_photo ON public.place_google_photos USING btree (place_id, google_photo_name);


--
-- Name: user_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_email_key ON public."user" USING btree (email);


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: menu_scans set_menu_scans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_menu_scans_updated_at BEFORE UPDATE ON public.menu_scans FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: place_google_enrichments set_place_google_enrichments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_place_google_enrichments_updated_at BEFORE UPDATE ON public.place_google_enrichments FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: place_menu_items set_place_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_place_menu_items_updated_at BEFORE UPDATE ON public.place_menu_items FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: place_menus set_place_menus_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_place_menus_updated_at BEFORE UPDATE ON public.place_menus FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: places set_places_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_places_updated_at BEFORE UPDATE ON public.places FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: beers set_public_beers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_beers_updated_at BEFORE UPDATE ON public.beers FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: brands set_public_brands_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: cellar_items set_public_cellar_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_cellar_items_updated_at BEFORE UPDATE ON public.cellar_items FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: cellar_owners set_public_cellar_owners_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_cellar_owners_updated_at BEFORE UPDATE ON public.cellar_owners FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: check_ins set_public_check_ins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_check_ins_updated_at BEFORE UPDATE ON public.check_ins FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: coffees set_public_coffee_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_coffee_updated_at BEFORE UPDATE ON public.coffees FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: friends set_public_friends_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_friends_updated_at BEFORE UPDATE ON public.friends FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: generic_items set_public_generic_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_generic_items_updated_at BEFORE UPDATE ON public.generic_items FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: item_onboardings set_public_item_onboardings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_item_onboardings_updated_at BEFORE UPDATE ON public.item_onboardings FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: item_reviews set_public_item_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_item_reviews_updated_at BEFORE UPDATE ON public.item_reviews FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: recipe_reviews set_public_recipe_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_recipe_reviews_updated_at BEFORE UPDATE ON public.recipe_reviews FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: recipes set_public_recipes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: spirits set_public_spirits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_spirits_updated_at BEFORE UPDATE ON public.spirits FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: tier_list_items set_public_tier_list_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_tier_list_items_updated_at BEFORE UPDATE ON public.tier_list_items FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: tier_lists set_public_tier_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_tier_lists_updated_at BEFORE UPDATE ON public.tier_lists FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: wines set_public_wines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_wines_updated_at BEFORE UPDATE ON public.wines FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: sakes set_updated_at_sakes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_sakes BEFORE UPDATE ON public.sakes FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: teas set_updated_at_teas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_teas BEFORE UPDATE ON public.teas FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: user_place_interactions set_user_place_interactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_user_place_interactions_updated_at BEFORE UPDATE ON public.user_place_interactions FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


--
-- Name: category_vectors trg_category_vectors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_category_vectors_updated_at BEFORE UPDATE ON public.category_vectors FOR EACH ROW EXECUTE FUNCTION public.update_category_vectors_updated_at();


--
-- Name: places trg_places_search_text; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_places_search_text BEFORE INSERT OR UPDATE OF name, categories, locality ON public.places FOR EACH ROW EXECUTE FUNCTION public.update_places_search_text();


--
-- Name: item_image update_item_image_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_item_image_updated_at BEFORE UPDATE ON public.item_image FOR EACH ROW EXECUTE FUNCTION public.update_item_image_updated_at();


--
-- Name: item_vectors update_item_vectors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_item_vectors_updated_at BEFORE UPDATE ON public.item_vectors FOR EACH ROW EXECUTE FUNCTION public.update_item_vectors_updated_at();


--
-- Name: place_vectors update_place_vectors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_place_vectors_updated_at BEFORE UPDATE ON public.place_vectors FOR EACH ROW EXECUTE FUNCTION public.update_place_vectors_updated_at();


--
-- Name: recipe_groups update_recipe_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recipe_groups_updated_at BEFORE UPDATE ON public.recipe_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recipe_vectors update_recipe_vectors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recipe_vectors_updated_at BEFORE UPDATE ON public.recipe_vectors FOR EACH ROW EXECUTE FUNCTION public.update_recipe_vectors_updated_at();


--
-- Name: recipe_votes update_recipe_votes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recipe_votes_updated_at BEFORE UPDATE ON public.recipe_votes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: buckets check_default_bucket_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER check_default_bucket_delete BEFORE DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_default_bucket_delete();


--
-- Name: buckets check_default_bucket_update; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER check_default_bucket_update BEFORE UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_default_bucket_update();


--
-- Name: buckets set_storage_buckets_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER set_storage_buckets_updated_at BEFORE UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.set_current_timestamp_updated_at();


--
-- Name: files set_storage_files_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER set_storage_files_updated_at BEFORE UPDATE ON storage.files FOR EACH ROW EXECUTE FUNCTION storage.set_current_timestamp_updated_at();


--
-- Name: virus set_storage_virus_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER set_storage_virus_updated_at BEFORE UPDATE ON storage.virus FOR EACH ROW EXECUTE FUNCTION storage.set_current_timestamp_updated_at();


--
-- Name: account account_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: beers beers_barcode_code_barcodes_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_barcode_code_barcodes_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: beers beers_country_country_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_country_country_value_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: beers beers_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: beers beers_item_onboarding_id_item_onboardings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_item_onboarding_id_item_onboardings_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: beers beers_style_beer_style_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_style_beer_style_value_fkey FOREIGN KEY (style) REFERENCES public.beer_style(value);


--
-- Name: brands brands_parent_brand_id_brands_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_parent_brand_id_brands_id_fkey FOREIGN KEY (parent_brand_id) REFERENCES public.brands(id);


--
-- Name: cellar_items cellar_items_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_cellar_id_cellars_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_cellar_id_cellars_id_fkey FOREIGN KEY (cellar_id) REFERENCES public.cellars(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_created_by_user_id_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_display_image_id_item_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_display_image_id_item_image_id_fkey FOREIGN KEY (display_image_id) REFERENCES public.item_image(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: cellar_items cellar_items_source_menu_item_id_place_menu_items_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_source_menu_item_id_place_menu_items_id_fkey FOREIGN KEY (source_menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE SET NULL;


--
-- Name: cellar_items cellar_items_source_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_source_place_id_places_id_fkey FOREIGN KEY (source_place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: cellar_items cellar_items_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: cellar_items cellar_items_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_owners cellar_owners_cellar_id_cellars_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_owners
    ADD CONSTRAINT cellar_owners_cellar_id_cellars_id_fkey FOREIGN KEY (cellar_id) REFERENCES public.cellars(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_owners cellar_owners_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_owners
    ADD CONSTRAINT cellar_owners_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellars cellars_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellars
    ADD CONSTRAINT cellars_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: check_ins check_ins_cellar_item_id_cellar_items_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_cellar_item_id_cellar_items_id_fkey FOREIGN KEY (cellar_item_id) REFERENCES public.cellar_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: check_ins check_ins_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffees_barcode_code_barcodes_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_barcode_code_barcodes_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffees_country_country_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_country_country_value_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: coffees coffees_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffees_cultivar_coffee_cultivar_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_cultivar_coffee_cultivar_value_fkey FOREIGN KEY (cultivar) REFERENCES public.coffee_cultivar(value);


--
-- Name: coffees coffees_item_onboarding_id_item_onboardings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_item_onboarding_id_item_onboardings_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friend_requests friend_requests_friend_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_friend_id_user_id_fkey FOREIGN KEY (friend_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friend_requests friend_requests_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friends friends_friend_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_friend_id_user_id_fkey FOREIGN KEY (friend_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friends friends_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: generic_items generic_items_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generic_items
    ADD CONSTRAINT generic_items_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: item_brands item_brands_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id);


--
-- Name: item_brands item_brands_brand_id_brands_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_brand_id_brands_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: item_brands item_brands_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id);


--
-- Name: item_brands item_brands_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_brands item_brands_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id);


--
-- Name: item_brands item_brands_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_brands item_brands_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id);


--
-- Name: item_favorites item_favorites_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_favorites item_favorites_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_favorites item_favorites_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_file_id_files_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_file_id_files_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_image item_image_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_image item_image_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_match_suggestions item_match_suggestions_acted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_acted_by_user_id_fkey FOREIGN KEY (acted_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: item_match_suggestions item_match_suggestions_iENvq4dzHuvQ_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT "item_match_suggestions_iENvq4dzHuvQ_fkey" FOREIGN KEY (place_menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_beer_id_beers_id_fkey FOREIGN KEY (suggested_beer_id) REFERENCES public.beers(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_coffee_id_coffees_id_fkey FOREIGN KEY (suggested_coffee_id) REFERENCES public.coffees(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_recipe_id_recipes_id_fkey FOREIGN KEY (suggested_recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_sake_id_sakes_id_fkey FOREIGN KEY (suggested_sake_id) REFERENCES public.sakes(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_spirit_id_spirits_id_fkey FOREIGN KEY (suggested_spirit_id) REFERENCES public.spirits(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_tea_id_teas_id_fkey FOREIGN KEY (suggested_tea_id) REFERENCES public.teas(id);


--
-- Name: item_match_suggestions item_match_suggestions_suggested_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_wine_id_wines_id_fkey FOREIGN KEY (suggested_wine_id) REFERENCES public.wines(id) ON DELETE CASCADE;


--
-- Name: item_onboardings item_onboardings_back_label_image_id_files_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_back_label_image_id_files_id_fkey FOREIGN KEY (back_label_image_id) REFERENCES public.files(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_onboardings item_onboardings_front_label_image_id_files_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_front_label_image_id_files_id_fkey FOREIGN KEY (front_label_image_id) REFERENCES public.files(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_onboardings item_onboardings_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_reviews item_reviews_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_reviews item_reviews_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_vectors item_vectors_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_vectors item_vectors_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: menu_item_recipes menu_item_recipes_menu_item_id_place_menu_items_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_recipes
    ADD CONSTRAINT menu_item_recipes_menu_item_id_place_menu_items_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_recipes menu_item_recipes_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_recipes
    ADD CONSTRAINT menu_item_recipes_recipe_id_recipes_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: menu_scans menu_scans_estimated_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_estimated_place_id_places_id_fkey FOREIGN KEY (estimated_place_id) REFERENCES public.places(id);


--
-- Name: menu_scans menu_scans_manual_place_override_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_manual_place_override_places_id_fkey FOREIGN KEY (manual_place_override) REFERENCES public.places(id);


--
-- Name: menu_scans menu_scans_original_image_id_files_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_original_image_id_files_id_fkey FOREIGN KEY (original_image_id) REFERENCES public.files(id);


--
-- Name: menu_scans menu_scans_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: menu_scans menu_scans_processed_image_id_files_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_processed_image_id_files_id_fkey FOREIGN KEY (processed_image_id) REFERENCES public.files(id);


--
-- Name: menu_scans menu_scans_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: place_brands place_brands_brand_id_brands_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_brands
    ADD CONSTRAINT place_brands_brand_id_brands_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: place_brands place_brands_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_brands
    ADD CONSTRAINT place_brands_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_google_enrichments place_google_enrichments_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_enrichments
    ADD CONSTRAINT place_google_enrichments_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_google_photos place_google_photos_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_photos
    ADD CONSTRAINT place_google_photos_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_google_photos place_google_photos_storage_file_id_files_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_photos
    ADD CONSTRAINT place_google_photos_storage_file_id_files_id_fkey FOREIGN KEY (storage_file_id) REFERENCES public.files(id);


--
-- Name: place_menu_items place_menu_items_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE SET NULL;


--
-- Name: place_menu_items place_menu_items_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON DELETE SET NULL;


--
-- Name: place_menu_items place_menu_items_match_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_match_verified_by_user_id_fkey FOREIGN KEY (match_verified_by) REFERENCES public."user"(id);


--
-- Name: place_menu_items place_menu_items_menu_scan_id_menu_scans_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_menu_scan_id_menu_scans_id_fkey FOREIGN KEY (menu_scan_id) REFERENCES public.menu_scans(id) ON DELETE CASCADE;


--
-- Name: place_menu_items place_menu_items_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_menu_items place_menu_items_place_menu_id_place_menus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_place_menu_id_place_menus_id_fkey FOREIGN KEY (place_menu_id) REFERENCES public.place_menus(id) ON DELETE CASCADE;


--
-- Name: place_menu_items place_menu_items_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON DELETE SET NULL;


--
-- Name: place_menu_items place_menu_items_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE SET NULL;


--
-- Name: place_menus place_menus_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_created_by_user_id_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id);


--
-- Name: place_menus place_menus_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_menus place_menus_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_verified_by_user_id_fkey FOREIGN KEY (verified_by) REFERENCES public."user"(id);


--
-- Name: place_vectors place_vectors_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_vectors
    ADD CONSTRAINT place_vectors_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: places places_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_created_by_user_id_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id);


--
-- Name: recipe_groups recipe_groups_canonical_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_groups
    ADD CONSTRAINT recipe_groups_canonical_recipe_id_recipes_id_fkey FOREIGN KEY (canonical_recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;


--
-- Name: recipe_groups recipe_groups_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_groups
    ADD CONSTRAINT recipe_groups_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: recipe_ingredients recipe_ingredients_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id);


--
-- Name: recipe_ingredients recipe_ingredients_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id);


--
-- Name: recipe_ingredients recipe_ingredients_generic_item_id_generic_items_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_generic_item_id_generic_items_id_fkey FOREIGN KEY (generic_item_id) REFERENCES public.generic_items(id);


--
-- Name: recipe_ingredients recipe_ingredients_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_recipe_id_recipes_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_ingredients recipe_ingredients_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: recipe_ingredients recipe_ingredients_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id);


--
-- Name: recipe_ingredients recipe_ingredients_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: recipe_ingredients recipe_ingredients_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id);


--
-- Name: recipe_instructions recipe_instructions_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_instructions
    ADD CONSTRAINT recipe_instructions_recipe_id_recipes_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_reviews recipe_reviews_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_reviews
    ADD CONSTRAINT recipe_reviews_recipe_id_recipes_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: recipe_reviews recipe_reviews_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_reviews
    ADD CONSTRAINT recipe_reviews_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: recipe_vectors recipe_vectors_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_vectors
    ADD CONSTRAINT recipe_vectors_recipe_id_recipes_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: recipe_votes recipe_votes_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_votes
    ADD CONSTRAINT recipe_votes_recipe_id_recipes_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_votes recipe_votes_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_votes
    ADD CONSTRAINT recipe_votes_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_canonical_recipe_id_recipes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_canonical_recipe_id_recipes_id_fkey FOREIGN KEY (canonical_recipe_id) REFERENCES public.recipes(id);


--
-- Name: recipes recipes_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: recipes recipes_recipe_group_id_recipe_groups_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_recipe_group_id_recipe_groups_id_fkey FOREIGN KEY (recipe_group_id) REFERENCES public.recipe_groups(id) ON DELETE SET NULL;


--
-- Name: sakes sakes_barcode_code_barcodes_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_barcode_code_barcodes_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code);


--
-- Name: sakes sakes_category_sake_category_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_category_sake_category_value_fkey FOREIGN KEY (category) REFERENCES public.sake_category(value);


--
-- Name: sakes sakes_country_country_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_country_country_value_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: sakes sakes_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id);


--
-- Name: sakes sakes_rice_variety_sake_rice_variety_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_rice_variety_sake_rice_variety_value_fkey FOREIGN KEY (rice_variety) REFERENCES public.sake_rice_variety(value);


--
-- Name: sakes sakes_type_sake_type_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_type_sake_type_value_fkey FOREIGN KEY (type) REFERENCES public.sake_type(value);


--
-- Name: session session_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: spirits spirits_barcode_code_barcodes_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_barcode_code_barcodes_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: spirits spirits_country_country_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_country_country_value_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: spirits spirits_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: spirits spirits_item_onboarding_id_item_onboardings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_item_onboarding_id_item_onboardings_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: spirits spirits_type_spirit_type_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_type_spirit_type_value_fkey FOREIGN KEY (type) REFERENCES public.spirit_type(value);


--
-- Name: teas teas_barcode_code_barcodes_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_barcode_code_barcodes_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code);


--
-- Name: teas teas_category_tea_category_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_category_tea_category_value_fkey FOREIGN KEY (category) REFERENCES public.tea_category(value);


--
-- Name: teas teas_country_country_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_country_country_value_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: teas teas_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id);


--
-- Name: tier_list_items tier_list_items_beer_id_beers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_beer_id_beers_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id);


--
-- Name: tier_list_items tier_list_items_coffee_id_coffees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_coffee_id_coffees_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id);


--
-- Name: tier_list_items tier_list_items_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id);


--
-- Name: tier_list_items tier_list_items_sake_id_sakes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_sake_id_sakes_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: tier_list_items tier_list_items_spirit_id_spirits_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_spirit_id_spirits_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id);


--
-- Name: tier_list_items tier_list_items_tea_id_teas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_tea_id_teas_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: tier_list_items tier_list_items_tier_list_id_tier_lists_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_tier_list_id_tier_lists_id_fkey FOREIGN KEY (tier_list_id) REFERENCES public.tier_lists(id) ON DELETE CASCADE;


--
-- Name: tier_list_items tier_list_items_wine_id_wines_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_wine_id_wines_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id);


--
-- Name: tier_lists tier_lists_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id);


--
-- Name: user_place_interactions user_place_interactions_place_id_places_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT user_place_interactions_place_id_places_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: user_place_interactions user_place_interactions_user_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT user_place_interactions_user_id_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: wines wines_barcode_code_barcodes_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_barcode_code_barcodes_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: wines wines_country_country_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_country_country_value_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: wines wines_created_by_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_created_by_id_user_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: wines wines_item_onboarding_id_item_onboardings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_item_onboarding_id_item_onboardings_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: wines wines_style_wine_style_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_style_wine_style_value_fkey FOREIGN KEY (style) REFERENCES public.wine_style(value);


--
-- Name: wines wines_variety_wine_variety_value_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_variety_wine_variety_value_fkey FOREIGN KEY (variety) REFERENCES public.wine_variety(value);


--
-- Name: files files_bucket_id_buckets_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.files
    ADD CONSTRAINT files_bucket_id_buckets_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: virus virus_file_id_files_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.virus
    ADD CONSTRAINT virus_file_id_files_id_fkey FOREIGN KEY (file_id) REFERENCES storage.files(id);


--
-- PostgreSQL database dump complete
--

\unrestrict wRGOt5PHdLVRlOKG7QOf7pbUFBt9e6xpPjUi7MnEGcHjL6hsRpO7UrvMycxmO3s

