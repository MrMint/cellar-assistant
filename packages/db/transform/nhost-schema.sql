--
-- PostgreSQL database dump
--

\restrict 3E5CmGNbiYPkPVgiaptY68Oh4s0kcm4YlqaZxuqRx0EkcHwnbAF1Foiqc99cBO8

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

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
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: hdb_catalog; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA hdb_catalog;


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
-- Name: email; Type: DOMAIN; Schema: auth; Owner: -
--

CREATE DOMAIN auth.email AS public.citext
	CONSTRAINT email_check CHECK ((VALUE OPERATOR(public.~) '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'::public.citext));


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
-- Name: check_oauth2_client_secret_hash(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.check_oauth2_client_secret_hash() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    IF NEW.client_secret_hash IS NOT NULL
       AND NEW.client_secret_hash !~ '^\$2[aby]?\$' THEN
        RAISE EXCEPTION 'client_secret_hash must be a bcrypt hash'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$_$;


--
-- Name: generate_oauth2_client_id(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.generate_oauth2_client_id() RETURNS text
    LANGUAGE sql
    AS $$
    SELECT 'nhoa_' || substring(encode(sha256(gen_random_uuid()::text::bytea), 'hex') from 1 for 16);
$$;


--
-- Name: is_valid_oauth2_scope(text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.is_valid_oauth2_scope(scope text) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
    SELECT scope IN ('openid', 'profile', 'email', 'phone', 'offline_access', 'graphql')
        OR scope ~ '^graphql:role:[a-zA-Z0-9_:.-]+$'
$_$;


--
-- Name: set_current_timestamp_updated_at(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.set_current_timestamp_updated_at() RETURNS trigger
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
-- Name: validate_oauth2_scopes(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.validate_oauth2_scopes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    s text;
BEGIN
    FOREACH s IN ARRAY NEW.scopes LOOP
        IF NOT auth.is_valid_oauth2_scope(s) THEN
            RAISE EXCEPTION 'invalid oauth2 scope: %', s
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;


--
-- Name: gen_hasura_uuid(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog.gen_hasura_uuid() RETURNS uuid
    LANGUAGE sql
    AS $$select gen_random_uuid()$$;


--
-- Name: insert_event_log(text, text, text, text, json); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog.insert_event_log(schema_name text, table_name text, trigger_name text, op text, row_data json) RETURNS text
    LANGUAGE plpgsql
    AS $$
  DECLARE
    id text;
    payload json;
    session_variables json;
    server_version_num int;
    trace_context json;
  BEGIN
    id := gen_random_uuid();
    server_version_num := current_setting('server_version_num');
    IF server_version_num >= 90600 THEN
      -- In some cases postgres sets the setting to an empty string, which is not a valid json.
      -- NULLIF will convert the empty string to NULL.
      -- Ref: https://github.com/hasura/graphql-engine/issues/8498
      session_variables := NULLIF(current_setting('hasura.user', 't'), '');
      trace_context := NULLIF(current_setting('hasura.tracecontext', 't'), '');
    ELSE
      BEGIN
        session_variables := current_setting('hasura.user');
      EXCEPTION WHEN OTHERS THEN
                  session_variables := NULL;
      END;
      BEGIN
        trace_context := current_setting('hasura.tracecontext');
      EXCEPTION WHEN OTHERS THEN
        trace_context := NULL;
      END;
    END IF;
    payload := json_build_object(
      'op', op,
      'data', row_data,
      'session_variables', session_variables,
      'trace_context', trace_context
    );
    INSERT INTO hdb_catalog.event_log
                (id, schema_name, table_name, trigger_name, payload)
    VALUES
    (id, schema_name, table_name, trigger_name, payload);
    RETURN id;
  END;
$$;


--
-- Name: notify_hasura_friend_request_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_friend_request_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."status"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."status"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."user_id" , OLD."friend_id" , OLD."id" , OLD."status"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."user_id" , NEW."friend_id" , NEW."id" , NEW."status"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('friend_requests' AS text), CAST('friend_request' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('friend_requests' AS text), CAST('friend_request' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_coffee_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_coffee_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."process" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."cultivar" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."roast_level" , OLD."species"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."process" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."roast_level" , NEW."species"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."process" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."roast_level" , NEW."species"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('coffees' AS text), CAST('generate_coffee_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('coffees' AS text), CAST('generate_coffee_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_coffee_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_coffee_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."process" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."cultivar" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."roast_level" , OLD."species"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."process" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."roast_level" , NEW."species"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."process" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."cultivar" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."roast_level" , OLD."species"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."process" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."roast_level" , NEW."species"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('coffees' AS text), CAST('generate_coffee_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('coffees' AS text), CAST('generate_coffee_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_item_image_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_item_image_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."spirit_id" , OLD."user_id" , OLD."id" , OLD."sake_id" , OLD."created_at" , OLD."tea_id" , OLD."placeholder" , OLD."coffee_id" , OLD."beer_id" , OLD."updated_at" , OLD."file_id" , OLD."is_public" , OLD."wine_id"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."spirit_id" , NEW."user_id" , NEW."id" , NEW."sake_id" , NEW."created_at" , NEW."tea_id" , NEW."placeholder" , NEW."coffee_id" , NEW."beer_id" , NEW."updated_at" , NEW."file_id" , NEW."is_public" , NEW."wine_id"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."spirit_id" , NEW."user_id" , NEW."id" , NEW."sake_id" , NEW."created_at" , NEW."tea_id" , NEW."placeholder" , NEW."coffee_id" , NEW."beer_id" , NEW."updated_at" , NEW."file_id" , NEW."is_public" , NEW."wine_id"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('item_image' AS text), CAST('generate_item_image_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('item_image' AS text), CAST('generate_item_image_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_recipe_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_recipe_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."serving_size" , OLD."id" , OLD."type" , OLD."difficulty_level" , OLD."image_url" , OLD."created_at" , OLD."canonical_recipe_id" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."recipe_group_id" , OLD."created_by_id" , OLD."version" , OLD."prep_time_minutes"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."serving_size" , NEW."id" , NEW."type" , NEW."difficulty_level" , NEW."image_url" , NEW."created_at" , NEW."canonical_recipe_id" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."recipe_group_id" , NEW."created_by_id" , NEW."version" , NEW."prep_time_minutes"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."serving_size" , NEW."id" , NEW."type" , NEW."difficulty_level" , NEW."image_url" , NEW."created_at" , NEW."canonical_recipe_id" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."recipe_group_id" , NEW."created_by_id" , NEW."version" , NEW."prep_time_minutes"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('recipes' AS text), CAST('generate_recipe_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('recipes' AS text), CAST('generate_recipe_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_recipe_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_recipe_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."serving_size" , OLD."id" , OLD."type" , OLD."difficulty_level" , OLD."image_url" , OLD."created_at" , OLD."canonical_recipe_id" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."recipe_group_id" , OLD."created_by_id" , OLD."version" , OLD."prep_time_minutes"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."serving_size" , NEW."id" , NEW."type" , NEW."difficulty_level" , NEW."image_url" , NEW."created_at" , NEW."canonical_recipe_id" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."recipe_group_id" , NEW."created_by_id" , NEW."version" , NEW."prep_time_minutes"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."serving_size" , OLD."id" , OLD."type" , OLD."difficulty_level" , OLD."image_url" , OLD."created_at" , OLD."canonical_recipe_id" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."recipe_group_id" , OLD."created_by_id" , OLD."version" , OLD."prep_time_minutes"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."serving_size" , NEW."id" , NEW."type" , NEW."difficulty_level" , NEW."image_url" , NEW."created_at" , NEW."canonical_recipe_id" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."recipe_group_id" , NEW."created_by_id" , NEW."version" , NEW."prep_time_minutes"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('recipes' AS text), CAST('generate_recipe_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('recipes' AS text), CAST('generate_recipe_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_sake_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_sake_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."yeast_strain" , OLD."barcode_code" , OLD."id" , OLD."acidity" , OLD."type" , OLD."region" , OLD."item_onboarding_id" , OLD."amino_acid" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."rice_variety" , OLD."sake_meter_value" , OLD."updated_at" , OLD."description" , OLD."category" , OLD."name" , OLD."created_by_id" , OLD."polish_grade" , OLD."vintage" , OLD."serving_temperature"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."yeast_strain" , NEW."barcode_code" , NEW."id" , NEW."acidity" , NEW."type" , NEW."region" , NEW."item_onboarding_id" , NEW."amino_acid" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."rice_variety" , NEW."sake_meter_value" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."created_by_id" , NEW."polish_grade" , NEW."vintage" , NEW."serving_temperature"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."yeast_strain" , NEW."barcode_code" , NEW."id" , NEW."acidity" , NEW."type" , NEW."region" , NEW."item_onboarding_id" , NEW."amino_acid" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."rice_variety" , NEW."sake_meter_value" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."created_by_id" , NEW."polish_grade" , NEW."vintage" , NEW."serving_temperature"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('sakes' AS text), CAST('generate_sake_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('sakes' AS text), CAST('generate_sake_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_sake_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_sake_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."yeast_strain" , OLD."barcode_code" , OLD."id" , OLD."acidity" , OLD."type" , OLD."region" , OLD."item_onboarding_id" , OLD."amino_acid" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."rice_variety" , OLD."sake_meter_value" , OLD."updated_at" , OLD."description" , OLD."category" , OLD."name" , OLD."created_by_id" , OLD."polish_grade" , OLD."vintage" , OLD."serving_temperature"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."yeast_strain" , NEW."barcode_code" , NEW."id" , NEW."acidity" , NEW."type" , NEW."region" , NEW."item_onboarding_id" , NEW."amino_acid" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."rice_variety" , NEW."sake_meter_value" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."created_by_id" , NEW."polish_grade" , NEW."vintage" , NEW."serving_temperature"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."yeast_strain" , OLD."barcode_code" , OLD."id" , OLD."acidity" , OLD."type" , OLD."region" , OLD."item_onboarding_id" , OLD."amino_acid" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."rice_variety" , OLD."sake_meter_value" , OLD."updated_at" , OLD."description" , OLD."category" , OLD."name" , OLD."created_by_id" , OLD."polish_grade" , OLD."vintage" , OLD."serving_temperature"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."yeast_strain" , NEW."barcode_code" , NEW."id" , NEW."acidity" , NEW."type" , NEW."region" , NEW."item_onboarding_id" , NEW."amino_acid" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."rice_variety" , NEW."sake_meter_value" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."created_by_id" , NEW."polish_grade" , NEW."vintage" , NEW."serving_temperature"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('sakes' AS text), CAST('generate_sake_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('sakes' AS text), CAST('generate_sake_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_spirit_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_spirit_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."type" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."vintage"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."type" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."type" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('spirits' AS text), CAST('generate_spirit_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('spirits' AS text), CAST('generate_spirit_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_spirit_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_spirit_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."type" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."vintage"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."type" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."type" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."vintage"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."type" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('spirits' AS text), CAST('generate_spirit_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('spirits' AS text), CAST('generate_spirit_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_tea_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_tea_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."form" , OLD."barcode_code" , OLD."id" , OLD."caffeine_level" , OLD."ingredients" , OLD."processing" , OLD."steeping_time" , OLD."region" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."is_organic" , OLD."cultivar" , OLD."updated_at" , OLD."description" , OLD."category" , OLD."name" , OLD."is_fair_trade" , OLD."created_by_id" , OLD."harvest_year" , OLD."oxidation_level" , OLD."steeping_temperature" , OLD."flavor_profile"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."form" , NEW."barcode_code" , NEW."id" , NEW."caffeine_level" , NEW."ingredients" , NEW."processing" , NEW."steeping_time" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."is_organic" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."is_fair_trade" , NEW."created_by_id" , NEW."harvest_year" , NEW."oxidation_level" , NEW."steeping_temperature" , NEW."flavor_profile"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."form" , NEW."barcode_code" , NEW."id" , NEW."caffeine_level" , NEW."ingredients" , NEW."processing" , NEW."steeping_time" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."is_organic" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."is_fair_trade" , NEW."created_by_id" , NEW."harvest_year" , NEW."oxidation_level" , NEW."steeping_temperature" , NEW."flavor_profile"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('teas' AS text), CAST('generate_tea_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('teas' AS text), CAST('generate_tea_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_tea_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_tea_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."form" , OLD."barcode_code" , OLD."id" , OLD."caffeine_level" , OLD."ingredients" , OLD."processing" , OLD."steeping_time" , OLD."region" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."is_organic" , OLD."cultivar" , OLD."updated_at" , OLD."description" , OLD."category" , OLD."name" , OLD."is_fair_trade" , OLD."created_by_id" , OLD."harvest_year" , OLD."oxidation_level" , OLD."steeping_temperature" , OLD."flavor_profile"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."form" , NEW."barcode_code" , NEW."id" , NEW."caffeine_level" , NEW."ingredients" , NEW."processing" , NEW."steeping_time" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."is_organic" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."is_fair_trade" , NEW."created_by_id" , NEW."harvest_year" , NEW."oxidation_level" , NEW."steeping_temperature" , NEW."flavor_profile"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."form" , OLD."barcode_code" , OLD."id" , OLD."caffeine_level" , OLD."ingredients" , OLD."processing" , OLD."steeping_time" , OLD."region" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."is_organic" , OLD."cultivar" , OLD."updated_at" , OLD."description" , OLD."category" , OLD."name" , OLD."is_fair_trade" , OLD."created_by_id" , OLD."harvest_year" , OLD."oxidation_level" , OLD."steeping_temperature" , OLD."flavor_profile"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."form" , NEW."barcode_code" , NEW."id" , NEW."caffeine_level" , NEW."ingredients" , NEW."processing" , NEW."steeping_time" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."is_organic" , NEW."cultivar" , NEW."updated_at" , NEW."description" , NEW."category" , NEW."name" , NEW."is_fair_trade" , NEW."created_by_id" , NEW."harvest_year" , NEW."oxidation_level" , NEW."steeping_temperature" , NEW."flavor_profile"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('teas' AS text), CAST('generate_tea_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('teas' AS text), CAST('generate_tea_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_tier_list_insights_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_tier_list_insights_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."content_updated_at"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."content_updated_at"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."id" , OLD."ai_insights" , OLD."content_updated_at" , OLD."created_at" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."is_editing_locked" , OLD."privacy" , OLD."created_by_id" , OLD."list_type" , OLD."insights_generated_at"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."id" , NEW."ai_insights" , NEW."content_updated_at" , NEW."created_at" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."is_editing_locked" , NEW."privacy" , NEW."created_by_id" , NEW."list_type" , NEW."insights_generated_at"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('tier_lists' AS text), CAST('generate_tier_list_insights' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('tier_lists' AS text), CAST('generate_tier_list_insights' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."international_bitterness_unit" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."vintage"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."international_bitterness_unit" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."international_bitterness_unit" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('beers' AS text), CAST('generate_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('beers' AS text), CAST('generate_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."international_bitterness_unit" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."vintage"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."international_bitterness_unit" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."international_bitterness_unit" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."created_by_id" , OLD."vintage"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."international_bitterness_unit" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."created_by_id" , NEW."vintage"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('beers' AS text), CAST('generate_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('beers' AS text), CAST('generate_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_wine_vector_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_wine_vector_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."winery_id" , OLD."vineyard_designation" , OLD."region" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."variety" , OLD."created_by_id" , OLD."vintage" , OLD."special_designation"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."winery_id" , NEW."vineyard_designation" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."variety" , NEW."created_by_id" , NEW."vintage" , NEW."special_designation"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."winery_id" , NEW."vineyard_designation" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."variety" , NEW."created_by_id" , NEW."vintage" , NEW."special_designation"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('wines' AS text), CAST('generate_wine_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('wines' AS text), CAST('generate_wine_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_generate_wine_vector_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_generate_wine_vector_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."winery_id" , OLD."vineyard_designation" , OLD."region" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."variety" , OLD."created_by_id" , OLD."vintage" , OLD."special_designation"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."winery_id" , NEW."vineyard_designation" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."variety" , NEW."created_by_id" , NEW."vintage" , NEW."special_designation"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."barcode_code" , OLD."id" , OLD."winery_id" , OLD."vineyard_designation" , OLD."region" , OLD."item_onboarding_id" , OLD."country" , OLD."created_at" , OLD."alcohol_content_percentage" , OLD."style" , OLD."updated_at" , OLD."description" , OLD."name" , OLD."variety" , OLD."created_by_id" , OLD."vintage" , OLD."special_designation"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."barcode_code" , NEW."id" , NEW."winery_id" , NEW."vineyard_designation" , NEW."region" , NEW."item_onboarding_id" , NEW."country" , NEW."created_at" , NEW."alcohol_content_percentage" , NEW."style" , NEW."updated_at" , NEW."description" , NEW."name" , NEW."variety" , NEW."created_by_id" , NEW."vintage" , NEW."special_designation"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('wines' AS text), CAST('generate_wine_vector' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('wines' AS text), CAST('generate_wine_vector' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_match_menu_items_on_scan_complete_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_match_menu_items_on_scan_complete_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."processing_status"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."processing_status"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  (ST_AsGeoJSON(OLD."scan_location", 15, 4 ))::json AS "scan_location", OLD."scanned_at" , OLD."user_id" , OLD."processed_image_id" , OLD."id" , OLD."processing_model" , OLD."processed_at" , OLD."processing_duration_ms" , OLD."extracted_text" , OLD."processing_status" , OLD."created_at" , OLD."estimated_place_id" , OLD."items_matched" , OLD."processing_error" , OLD."updated_at" , OLD."manual_place_override" , OLD."original_image_id" , OLD."items_detected" , OLD."confidence_score" , OLD."place_id"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  (ST_AsGeoJSON(NEW."scan_location", 15, 4 ))::json AS "scan_location", NEW."scanned_at" , NEW."user_id" , NEW."processed_image_id" , NEW."id" , NEW."processing_model" , NEW."processed_at" , NEW."processing_duration_ms" , NEW."extracted_text" , NEW."processing_status" , NEW."created_at" , NEW."estimated_place_id" , NEW."items_matched" , NEW."processing_error" , NEW."updated_at" , NEW."manual_place_override" , NEW."original_image_id" , NEW."items_detected" , NEW."confidence_score" , NEW."place_id"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('menu_scans' AS text), CAST('match_menu_items_on_scan_complete' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('menu_scans' AS text), CAST('match_menu_items_on_scan_complete' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_process_onboarding_reprocess_batch_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_process_onboarding_reprocess_batch_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."total_updated" , OLD."id" , OLD."status" , OLD."skip_reasons" , OLD."filter_ai_model" , OLD."total_processed" , OLD."cursor" , OLD."created_at" , OLD."error_message" , OLD."total_batches" , OLD."updated_at" , OLD."total_skipped"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."total_updated" , NEW."id" , NEW."status" , NEW."skip_reasons" , NEW."filter_ai_model" , NEW."total_processed" , NEW."cursor" , NEW."created_at" , NEW."error_message" , NEW."total_batches" , NEW."updated_at" , NEW."total_skipped"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."total_updated" , NEW."id" , NEW."status" , NEW."skip_reasons" , NEW."filter_ai_model" , NEW."total_processed" , NEW."cursor" , NEW."created_at" , NEW."error_message" , NEW."total_batches" , NEW."updated_at" , NEW."total_skipped"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('onboarding_reprocess_jobs' AS text), CAST('process_onboarding_reprocess_batch' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('onboarding_reprocess_jobs' AS text), CAST('process_onboarding_reprocess_batch' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_process_onboarding_reprocess_batch_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_process_onboarding_reprocess_batch_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."cursor"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."cursor"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."total_updated" , OLD."id" , OLD."status" , OLD."skip_reasons" , OLD."filter_ai_model" , OLD."total_processed" , OLD."cursor" , OLD."created_at" , OLD."error_message" , OLD."total_batches" , OLD."updated_at" , OLD."total_skipped"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."total_updated" , NEW."id" , NEW."status" , NEW."skip_reasons" , NEW."filter_ai_model" , NEW."total_processed" , NEW."cursor" , NEW."created_at" , NEW."error_message" , NEW."total_batches" , NEW."updated_at" , NEW."total_skipped"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('onboarding_reprocess_jobs' AS text), CAST('process_onboarding_reprocess_batch' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('onboarding_reprocess_jobs' AS text), CAST('process_onboarding_reprocess_batch' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_process_place_refresh_batch_INSERT(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_process_place_refresh_batch_INSERT"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."id" , OLD."status" , OLD."total_inserted" , OLD."cursor" , OLD."created_at" , OLD."error_message" , OLD."total_batches" , OLD."updated_at"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."id" , NEW."status" , NEW."total_inserted" , NEW."cursor" , NEW."created_at" , NEW."error_message" , NEW."total_batches" , NEW."updated_at"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', NULL,
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."id" , NEW."status" , NEW."total_inserted" , NEW."cursor" , NEW."created_at" , NEW."error_message" , NEW."total_batches" , NEW."updated_at"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('place_refresh_jobs' AS text), CAST('process_place_refresh_batch' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('place_refresh_jobs' AS text), CAST('process_place_refresh_batch' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


--
-- Name: notify_hasura_process_place_refresh_batch_UPDATE(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog."notify_hasura_process_place_refresh_batch_UPDATE"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    _old record;
    _new record;
    _data json;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      _old := row((SELECT  "e"  FROM  (SELECT  OLD."cursor"        ) AS "e"      ) );
      _new := row((SELECT  "e"  FROM  (SELECT  NEW."cursor"        ) AS "e"      ) );
    ELSE
    /* initialize _old and _new with dummy values for INSERT and UPDATE events*/
      _old := row((select 1));
      _new := row((select 1));
    END IF;
    _data := json_build_object(
      'old', row_to_json((SELECT  "e"  FROM  (SELECT  OLD."id" , OLD."status" , OLD."total_inserted" , OLD."cursor" , OLD."created_at" , OLD."error_message" , OLD."total_batches" , OLD."updated_at"        ) AS "e"      ) ),
      'new', row_to_json((SELECT  "e"  FROM  (SELECT  NEW."id" , NEW."status" , NEW."total_inserted" , NEW."cursor" , NEW."created_at" , NEW."error_message" , NEW."total_batches" , NEW."updated_at"        ) AS "e"      ) )
    );
    BEGIN
    /* NOTE: formerly we used TG_TABLE_NAME in place of tableName here. However in the case of
    partitioned tables this will give the name of the partitioned table and since we use the table name to
    get the event trigger configuration from the schema, this fails because the event trigger is only created
    on the original table.  */
      IF (TG_OP <> 'UPDATE') OR (_old <> _new) THEN
        PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('place_refresh_jobs' AS text), CAST('process_place_refresh_batch' AS text), TG_OP, _data);
      END IF;
      EXCEPTION WHEN undefined_function THEN
        IF (TG_OP <> 'UPDATE') OR (_old *<> _new) THEN
          PERFORM hdb_catalog.insert_event_log(CAST('public' AS text), CAST('place_refresh_jobs' AS text), CAST('process_place_refresh_batch' AS text), TG_OP, _data);
        END IF;
    END;

    RETURN NULL;
  END;
$$;


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
-- Name: duplicate_place_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duplicate_place_results (
    id uuid,
    name text,
    primary_category text,
    location public.geography(Point,4326),
    street_address text,
    locality text,
    similarity real,
    distance_m double precision
);


--
-- Name: find_duplicate_places(text, double precision, double precision, double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_duplicate_places(place_name text, place_lat double precision, place_lng double precision, search_radius_m double precision DEFAULT 200, min_similarity double precision DEFAULT 0.3, result_limit integer DEFAULT 5) RETURNS SETOF public.duplicate_place_results
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  search_point GEOGRAPHY;
BEGIN
  -- Create geography point from lat/lng
  search_point := ST_SetSRID(ST_MakePoint(place_lng, place_lat), 4326)::GEOGRAPHY;

  -- Return places within radius, ordered by similarity and distance
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.primary_category,
    p.location,
    p.street_address,
    p.locality,
    SIMILARITY(p.name, place_name) AS similarity,
    ST_Distance(p.location, search_point) AS distance_m
  FROM public.places p
  WHERE
    p.is_active = true
    AND ST_DWithin(p.location, search_point, search_radius_m)
    AND SIMILARITY(p.name, place_name) >= min_similarity
  ORDER BY
    similarity DESC,
    distance_m ASC
  LIMIT result_limit;
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
-- Name: search_category_vectors_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_category_vectors_results (
    id integer,
    label text,
    label_type text,
    associated_categories text[],
    metadata jsonb,
    distance double precision
);


--
-- Name: search_category_vectors(public.halfvec, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_category_vectors(query_vector public.halfvec, max_distance double precision DEFAULT 0.8, result_limit integer DEFAULT 15) RETURNS SETOF public.search_category_vectors_results
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    cv.id,
    cv.label,
    cv.label_type,
    cv.associated_categories,
    cv.metadata,
    (cv.vector <=> query_vector)::FLOAT8 AS distance
  FROM public.category_vectors cv
  WHERE (cv.vector <=> query_vector) <= max_distance
  ORDER BY cv.vector <=> query_vector
  LIMIT result_limit;
END;
$$;


--
-- Name: place_search_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_search_results (
    is_cluster boolean NOT NULL,
    cluster_id integer,
    cluster_count integer,
    cluster_center public.geography(Point,4326),
    cluster_bounds public.geometry(Polygon,4326),
    id uuid,
    name text,
    location public.geography(Point,4326),
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
    clustering_applied boolean DEFAULT false,
    CONSTRAINT place_search_results_cluster_check CHECK ((((is_cluster = true) AND (cluster_id IS NOT NULL)) OR ((is_cluster = false) AND (id IS NOT NULL))))
);


--
-- Name: search_places_adaptive_cluster(double precision, double precision, double precision, double precision, text[], double precision, text, uuid, integer, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_places_adaptive_cluster(west_bound double precision, south_bound double precision, east_bound double precision, north_bound double precision, category_filter text[] DEFAULT NULL::text[], min_rating double precision DEFAULT NULL::double precision, visit_status_filter text DEFAULT NULL::text, filter_user_id uuid DEFAULT NULL::uuid, result_limit integer DEFAULT 500, tier_list_ids uuid[] DEFAULT NULL::uuid[]) RETURNS SETOF public.place_search_results
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  viewport_area_km2_calc FLOAT;
  viewport_max_dim_km FLOAT;
  cluster_distance_meters FLOAT;
  clustering_threshold INTEGER;
  density_factor FLOAT;
  confidence_floor FLOAT;
  total_places INTEGER;
  input_limit INTEGER;
  noise_limit INTEGER;
  scale_factor FLOAT;
  bounded_count INTEGER;
  table_total_estimate FLOAT;
  bbox geometry;
  grid_cells INTEGER;
  per_cell_limit INTEGER;
BEGIN
  -- Pre-compute bounding box to avoid repeated construction
  bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);

  -- Calculate viewport area in km²
  SELECT ST_Area(bbox::geography) / 1000000 INTO viewport_area_km2_calc;

  -- Calculate viewport max dimension (width vs height) in km
  viewport_max_dim_km := GREATEST(
    ST_Distance(
      ST_SetSRID(ST_MakePoint(west_bound, (north_bound + south_bound) / 2.0), 4326)::geography,
      ST_SetSRID(ST_MakePoint(east_bound, (north_bound + south_bound) / 2.0), 4326)::geography
    ) / 1000.0,
    ST_Distance(
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, south_bound), 4326)::geography,
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, north_bound), 4326)::geography
    ) / 1000.0
  );

  -- ============================================================
  -- Zoom-dependent clustering threshold
  -- At close zoom show individual markers; only cluster when zoomed out
  -- ============================================================
  clustering_threshold := CASE
    WHEN viewport_max_dim_km < 2  THEN 2147483647  -- street level: never cluster
    WHEN viewport_max_dim_km < 5  THEN 100          -- neighborhood: cluster only when dense
    ELSE 20                                          -- city+: cluster at > 20 (unchanged)
  END;

  -- ============================================================
  -- TIER LIST FAST PATH
  -- When tier_list_ids is provided, drive from tier_list_items
  -- (small set, typically 10-100 rows per tier list) instead of
  -- scanning the places table (7M rows). This allows tier list
  -- queries at any zoom level including global view.
  -- ============================================================
  IF tier_list_ids IS NOT NULL THEN

    -- User-curated items: show all regardless of confidence
    confidence_floor := 0;

    -- Tier lists are small; use result_limit directly
    input_limit := result_limit;
    noise_limit := result_limit;

    -- Count matching tier list places.
    -- Skip bounds filter at wide zoom (>10000 km dimension) to show ALL tier list places.
    -- PostGIS geography && operator breaks for envelopes spanning >180° longitude,
    -- and at continental/global zoom showing all tier list places is the right UX.
    -- At local zoom, filter by viewport bounds.
    IF visit_status_filter IS NOT NULL AND filter_user_id IS NOT NULL THEN
      SELECT count(*) INTO bounded_count FROM (
        SELECT 1
        FROM tier_list_items tli
        JOIN places p ON p.id = tli.place_id
        LEFT JOIN user_place_interactions upi
          ON p.id = upi.place_id AND upi.user_id = filter_user_id
        WHERE tli.tier_list_id = ANY(tier_list_ids)
          AND tli.place_id IS NOT NULL
          AND p.is_active = true
          AND (viewport_max_dim_km > 10000 OR p.location && bbox)
          AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p.rating >= min_rating)
          AND (visit_status_filter = 'visited' AND upi.is_visited = true
            OR visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false))
        LIMIT input_limit + 1
      ) sub;
    ELSE
      SELECT count(*) INTO bounded_count FROM (
        SELECT 1
        FROM tier_list_items tli
        JOIN places p ON p.id = tli.place_id
        WHERE tli.tier_list_id = ANY(tier_list_ids)
          AND tli.place_id IS NOT NULL
          AND p.is_active = true
          AND (viewport_max_dim_km > 10000 OR p.location && bbox)
          AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p.rating >= min_rating)
        LIMIT input_limit + 1
      ) sub;
    END IF;

    IF bounded_count = 0 THEN
      RETURN;
    END IF;

    -- Clustering parameters
    total_places := bounded_count;
    scale_factor := 1.0;  -- exact count, no estimation needed
    density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
    -- Viewport-proportional minimum instead of fixed 50m floor
    cluster_distance_meters := GREATEST(
      viewport_max_dim_km * 5,
      LEAST(500000, viewport_max_dim_km * 50 * density_factor)
    );

    IF bounded_count > clustering_threshold THEN
      -- Cluster tier list places using DBSCAN
      RETURN QUERY
      WITH filtered_places AS (
        SELECT
          p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
          p.street_address, p.locality, p.region, p.postcode, p.country_code,
          p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
          p.review_count, p.is_verified,
          ST_Transform(p.location::geometry, 3857) as geom
        FROM tier_list_items tli
        JOIN places p ON p.id = tli.place_id
        LEFT JOIN user_place_interactions upi
          ON visit_status_filter IS NOT NULL
          AND filter_user_id IS NOT NULL
          AND p.id = upi.place_id
          AND upi.user_id = filter_user_id
        WHERE tli.tier_list_id = ANY(tier_list_ids)
          AND tli.place_id IS NOT NULL
          AND p.is_active = true
          AND (viewport_max_dim_km > 10000 OR p.location && bbox)
          AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p.rating >= min_rating)
          AND (visit_status_filter IS NULL OR
               (visit_status_filter = 'visited' AND upi.is_visited = true) OR
               (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
        ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
        LIMIT input_limit
      ),
      clustered_places AS (
        SELECT
          fp.*,
          ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 2) OVER () as cluster_id_calc
        FROM filtered_places fp
      ),
      cluster_summary AS (
        SELECT
          cluster_id_calc,
          COUNT(*) as place_count,
          ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
          ST_Transform(
            ST_Buffer(ST_ConvexHull(ST_Collect(geom)), GREATEST(cluster_distance_meters * 0.1, 100)),
            4326
          )::geometry(polygon,4326) as bounds,
          AVG(confidence)::numeric(3,2) as avg_confidence,
          AVG(rating)::numeric(2,1) as avg_rating
        FROM clustered_places
        WHERE cluster_id_calc IS NOT NULL
        GROUP BY cluster_id_calc
        HAVING COUNT(*) >= 2
      ),
      single_places AS (
        SELECT cp.* FROM clustered_places cp
        WHERE cp.cluster_id_calc IS NULL
        ORDER BY cp.confidence DESC, cp.rating DESC NULLS LAST
        LIMIT noise_limit
      )
      -- Return clusters
      SELECT
        true::boolean,
        cs.cluster_id_calc::integer,
        ROUND(cs.place_count * scale_factor)::integer,
        cs.center_point::geography(point,4326),
        cs.bounds::geometry(polygon,4326),
        gen_random_uuid(),
        ('🏪 ' || ROUND(cs.place_count * scale_factor) || ' places')::text,
        cs.center_point::geography(point,4326),
        'cluster'::text,
        ARRAY['cluster']::text[],
        cs.avg_confidence,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
        NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
        cs.avg_rating, 0::integer, false::boolean,
        viewport_area_km2_calc,
        ROUND(cs.place_count * scale_factor)::float / GREATEST(viewport_area_km2_calc, 1.0),
        true::boolean
      FROM cluster_summary cs

      UNION ALL

      -- Return unclustered places
      SELECT
        false::boolean,
        NULL::integer, NULL::integer,
        NULL::geography(point,4326), NULL::geometry(polygon,4326),
        sp.id, sp.name, sp.location::geography(point,4326),
        sp.primary_category, sp.categories, sp.confidence,
        sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
        sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
        sp.review_count, sp.is_verified,
        viewport_area_km2_calc,
        total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
        true::boolean
      FROM single_places sp;

    ELSE
      -- Return individual places (no clustering needed)
      RETURN QUERY
      SELECT
        false::boolean,
        NULL::integer, NULL::integer,
        NULL::geography(point,4326), NULL::geometry(polygon,4326),
        p.id, p.name, p.location::geography(point,4326),
        p.primary_category, p.categories, p.confidence,
        p.street_address, p.locality, p.region, p.postcode, p.country_code,
        p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
        p.review_count, p.is_verified,
        viewport_area_km2_calc,
        total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
        false::boolean
      FROM tier_list_items tli
      JOIN places p ON p.id = tli.place_id
      LEFT JOIN user_place_interactions upi
        ON visit_status_filter IS NOT NULL
        AND filter_user_id IS NOT NULL
        AND p.id = upi.place_id
        AND upi.user_id = filter_user_id
      WHERE tli.tier_list_id = ANY(tier_list_ids)
        AND tli.place_id IS NOT NULL
        AND p.is_active = true
        AND (viewport_max_dim_km > 10000 OR p.location && bbox)
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
        AND (visit_status_filter IS NULL OR
             (visit_status_filter = 'visited' AND upi.is_visited = true) OR
             (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
      ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
      LIMIT result_limit;
    END IF;

    RETURN;  -- Don't fall through to the non-tier-list code path
  END IF;

  -- ============================================================
  -- STANDARD PATH (no tier list filter)
  -- ============================================================

  -- Skip query entirely at world-view zoom (viewport > 50M km²)
  IF viewport_area_km2_calc > 50000000 THEN
    RETURN;
  END IF;

  -- ============================================================
  -- Progressive confidence floor when filtering by category
  -- ============================================================
  IF category_filter IS NOT NULL THEN
    confidence_floor := GREATEST(0.5, LEAST(0.9,
      0.5 + 0.4 * LEAST(1.0, viewport_area_km2_calc / 100.0)
    ));
  ELSE
    confidence_floor := 0.5;
  END IF;

  -- Input limit scales with viewport but stays manageable
  input_limit := CASE
    WHEN viewport_area_km2_calc > 1000000 THEN result_limit           -- 500 at continent
    WHEN viewport_area_km2_calc > 100000  THEN result_limit * 2       -- 1000 at multi-state
    WHEN viewport_area_km2_calc > 10000   THEN result_limit * 3       -- 1500 at state
    ELSE result_limit * 2                                              -- 1000 at local
  END;

  -- Cap on unclustered/noise points returned
  noise_limit := CASE
    WHEN viewport_area_km2_calc > 100000 THEN 50
    WHEN viewport_area_km2_calc > 10000  THEN 100
    ELSE result_limit
  END;

  -- ============================================================
  -- For small viewports (< 50 km²) skip the count pre-query.
  -- There are few enough rows that clustering math is cheap and
  -- the count scan is wasted I/O.
  -- ============================================================
  IF viewport_area_km2_calc < 50 THEN
    bounded_count := input_limit;
  ELSIF visit_status_filter IS NOT NULL AND filter_user_id IS NOT NULL THEN
    SELECT count(*) INTO bounded_count FROM (
      SELECT 1 FROM places p
      LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = filter_user_id)
      WHERE p.location && bbox
        AND p.is_active = true
        AND p.confidence >= confidence_floor
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
        AND (visit_status_filter = 'visited' AND upi.is_visited = true
          OR visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false))
      LIMIT input_limit + 1
    ) sub;
  ELSE
    SELECT count(*) INTO bounded_count FROM (
      SELECT 1 FROM places p
      WHERE p.location && bbox
        AND p.is_active = true
        AND p.confidence >= confidence_floor
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
      LIMIT input_limit + 1
    ) sub;
  END IF;

  -- ============================================================
  -- Estimate total from table stats when over limit
  -- ============================================================
  IF bounded_count > input_limit THEN
    SELECT reltuples INTO table_total_estimate
    FROM pg_class WHERE relname = 'places';

    total_places := GREATEST(
      bounded_count,
      (table_total_estimate * LEAST(1.0, viewport_area_km2_calc / 150000000.0))::integer
    );
  ELSE
    total_places := bounded_count;
  END IF;

  -- Scale factor to estimate true cluster counts from sampled data
  scale_factor := GREATEST(1.0, total_places::float / GREATEST(input_limit, 1)::float);

  -- ============================================================
  -- Density-aware cluster distance using max dimension
  -- Viewport-proportional minimum instead of fixed 50m floor
  -- ============================================================
  density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
  cluster_distance_meters := GREATEST(
    viewport_max_dim_km * 5,
    LEAST(500000, viewport_max_dim_km * 50 * density_factor)
  );

  -- Cluster only when exceeding zoom-dependent threshold
  IF bounded_count > clustering_threshold THEN

    -- Calculate grid dimensions for large viewports
    grid_cells := CASE
      WHEN viewport_area_km2_calc > 100000 THEN 5  -- 5x5 = 25 cells
      ELSE 1                                        -- No grid (single cell = standard query)
    END;
    per_cell_limit := CASE
      WHEN grid_cells > 1 THEN GREATEST(4, input_limit / (grid_cells * grid_cells))
      ELSE input_limit
    END;

    RETURN QUERY
    WITH filtered_places AS (
      SELECT
        p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
        p.street_address, p.locality, p.region, p.postcode, p.country_code,
        p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
        p.review_count, p.is_verified,
        ST_Transform(p.location::geometry, 3857) as geom
      FROM generate_series(0, grid_cells - 1) gx
      CROSS JOIN generate_series(0, grid_cells - 1) gy
      CROSS JOIN LATERAL (
        SELECT
          p2.id, p2.name, p2.location, p2.primary_category, p2.categories, p2.confidence,
          p2.street_address, p2.locality, p2.region, p2.postcode, p2.country_code,
          p2.phone, p2.website, p2.email, p2.hours, p2.price_level, p2.rating,
          p2.review_count, p2.is_verified
        FROM places p2
        LEFT JOIN user_place_interactions upi
          ON visit_status_filter IS NOT NULL
          AND filter_user_id IS NOT NULL
          AND p2.id = upi.place_id
          AND upi.user_id = filter_user_id
        WHERE p2.location && ST_MakeEnvelope(
          west_bound  + (east_bound - west_bound) * gx::float / grid_cells,
          south_bound + (north_bound - south_bound) * gy::float / grid_cells,
          west_bound  + (east_bound - west_bound) * (gx + 1)::float / grid_cells,
          south_bound + (north_bound - south_bound) * (gy + 1)::float / grid_cells,
          4326
        )
          AND p2.is_active = true
          AND p2.confidence >= confidence_floor
          AND (category_filter IS NULL OR p2.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p2.rating >= min_rating)
          AND (visit_status_filter IS NULL OR
               (visit_status_filter = 'visited' AND upi.is_visited = true) OR
               (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
        ORDER BY
          CASE WHEN grid_cells = 1 THEN p2.confidence ELSE NULL END DESC,
          CASE WHEN grid_cells = 1 THEN p2.rating ELSE NULL END DESC NULLS LAST
        LIMIT per_cell_limit
      ) p
    ),
    clustered_places AS (
      SELECT
        fp.*,
        ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 2) OVER () as cluster_id_calc
      FROM filtered_places fp
    ),
    cluster_summary AS (
      SELECT
        cluster_id_calc,
        COUNT(*) as place_count,
        ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
        ST_Transform(
          ST_Buffer(ST_ConvexHull(ST_Collect(geom)), GREATEST(cluster_distance_meters * 0.1, 100)),
          4326
        )::geometry(polygon,4326) as bounds,
        AVG(confidence)::numeric(3,2) as avg_confidence,
        AVG(rating)::numeric(2,1) as avg_rating
      FROM clustered_places
      WHERE cluster_id_calc IS NOT NULL
      GROUP BY cluster_id_calc
      HAVING COUNT(*) >= 2
    ),
    single_places AS (
      SELECT cp.* FROM clustered_places cp
      WHERE cp.cluster_id_calc IS NULL
      ORDER BY cp.confidence DESC, cp.rating DESC NULLS LAST
      LIMIT noise_limit
    )
    -- Return clusters with estimated true counts
    SELECT
      true::boolean,
      cs.cluster_id_calc::integer,
      ROUND(cs.place_count * scale_factor)::integer,
      cs.center_point::geography(point,4326),
      cs.bounds::geometry(polygon,4326),
      gen_random_uuid(),
      ('🏪 ' || ROUND(cs.place_count * scale_factor) || ' places')::text,
      cs.center_point::geography(point,4326),
      'cluster'::text,
      ARRAY['cluster']::text[],
      cs.avg_confidence,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
      NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
      cs.avg_rating, 0::integer, false::boolean,
      viewport_area_km2_calc,
      ROUND(cs.place_count * scale_factor)::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM cluster_summary cs

    UNION ALL

    SELECT
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      sp.id, sp.name, sp.location::geography(point,4326),
      sp.primary_category, sp.categories, sp.confidence,
      sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
      sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
      sp.review_count, sp.is_verified,
      viewport_area_km2_calc,
      total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM single_places sp;

  ELSE
    -- Return individual places when count is low or zoom is close
    RETURN QUERY
    SELECT
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      p.id, p.name, p.location::geography(point,4326),
      p.primary_category, p.categories, p.confidence,
      p.street_address, p.locality, p.region, p.postcode, p.country_code,
      p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
      p.review_count, p.is_verified,
      viewport_area_km2_calc, total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
      false::boolean
    FROM places p
    LEFT JOIN user_place_interactions upi
      ON visit_status_filter IS NOT NULL
      AND filter_user_id IS NOT NULL
      AND p.id = upi.place_id
      AND upi.user_id = filter_user_id
    WHERE p.location && bbox
      AND p.is_active = true
      AND p.confidence >= confidence_floor
      AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (visit_status_filter IS NULL OR
           (visit_status_filter = 'visited' AND upi.is_visited = true) OR
           (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
    ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
    LIMIT result_limit;
  END IF;

END;
$$;


--
-- Name: hybrid_search_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hybrid_search_results (
    id uuid,
    name text,
    location public.geography(Point,4326),
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
    text_rank double precision,
    trigram_similarity double precision,
    category_score double precision,
    combined_score double precision
);


--
-- Name: search_places_hybrid(text, text[], double precision[], double precision, double precision, double precision, double precision, double precision, integer, uuid[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_places_hybrid(search_query text, matched_categories text[] DEFAULT NULL::text[], category_scores double precision[] DEFAULT NULL::double precision[], west_bound double precision DEFAULT NULL::double precision, south_bound double precision DEFAULT NULL::double precision, east_bound double precision DEFAULT NULL::double precision, north_bound double precision DEFAULT NULL::double precision, min_rating double precision DEFAULT NULL::double precision, result_limit integer DEFAULT 50, tier_list_ids uuid[] DEFAULT NULL::uuid[], filter_categories text[] DEFAULT NULL::text[]) RETURNS SETOF public.hybrid_search_results
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  tsquery_val TSQUERY;
  has_categories BOOLEAN;
  has_text_query BOOLEAN;
  has_filter BOOLEAN;
  bbox geometry;
  safe_query TEXT;
  compact_query TEXT;
BEGIN
  has_categories := matched_categories IS NOT NULL AND array_length(matched_categories, 1) > 0;
  has_text_query := search_query IS NOT NULL AND length(trim(search_query)) > 0;
  has_filter := filter_categories IS NOT NULL AND array_length(filter_categories, 1) > 0;

  IF has_text_query THEN
    tsquery_val := websearch_to_tsquery('simple', search_query);
    -- Escape LIKE wildcards for safe ILIKE usage in trgm_matches
    safe_query := replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_');
    -- Normalized version for compact name matching (strip all non-alphanumeric)
    compact_query := regexp_replace(lower(search_query), '[^a-z0-9]', '', 'g');
  END IF;

  -- Pre-compute bounding box once (used by && operator below)
  IF west_bound IS NOT NULL AND south_bound IS NOT NULL
     AND east_bound IS NOT NULL AND north_bound IS NOT NULL THEN
    bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);
  END IF;

  RETURN QUERY
  WITH
  -- Index-first strategy: each match layer queries the places table directly
  -- so PostgreSQL can leverage GIN indexes for text/trigram/category lookups.

  -- Layer 1A: Full-text search — uses GIN index idx_places_search_text.
  text_matches AS (
    SELECT
      p.id,
      ts_rank_cd(p.search_text, tsquery_val, 32) AS rank_score
    FROM public.places p
    WHERE has_text_query
      AND p.is_active = true
      AND p.search_text @@ tsquery_val
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  -- Layer 1B: Fuzzy name matching — three candidate generation paths merged
  -- via BitmapOr. No ORDER BY: allows early termination via LIMIT.
  --   a) ILIKE on name — exact substring (GIN idx_places_name_trgm)
  --   b) ILIKE on space-stripped name — missing spaces (GIN idx_places_name_compact_trgm)
  --   c) <% word_similarity — character-level typos (GIN idx_places_name_trgm)
  trgm_matches AS (
    SELECT
      p.id,
      word_similarity(search_query, p.name) AS sim_score
    FROM public.places p
    WHERE has_text_query
      AND length(trim(search_query)) >= 3
      AND p.is_active = true
      AND (
        p.name ILIKE '%' || safe_query || '%'
        OR regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g') ILIKE '%' || compact_query || '%'
        OR search_query OPERATOR(public.<%) p.name
      )
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 2
  ),
  -- Layer 2: Category matching — uses GIN index idx_places_categories
  category_matches AS (
    SELECT
      p.id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN p.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM public.places p
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(p.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND p.is_active = true
      AND (p.primary_category = ANY(matched_categories) OR p.categories && matched_categories)
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  -- Merge all match layers (raw scores)
  merged AS (
    SELECT
      COALESCE(tm.id, tg.id, cm.id) AS place_id,
      COALESCE(tm.rank_score, 0.0)::FLOAT8 AS raw_text_rank,
      COALESCE(tg.sim_score, 0.0)::FLOAT8 AS trigram_similarity,
      COALESCE(cm.cat_score, 0.0)::FLOAT8 AS category_score
    FROM text_matches tm
    FULL OUTER JOIN trgm_matches tg ON tm.id = tg.id
    FULL OUTER JOIN category_matches cm ON COALESCE(tm.id, tg.id) = cm.id
  ),
  -- Category enrichment: text/trgm matched places may not appear in the
  -- LIMIT-constrained category_matches (e.g., 1.37M coffee shops but only
  -- 150 picked). For the small text/trgm set, look up actual category scores
  -- via primary key — just a handful of index lookups.
  category_enrich AS (
    SELECT
      m.place_id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN p.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM merged m
    JOIN public.places p ON p.id = m.place_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(p.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND m.category_score = 0.0
      AND (m.raw_text_rank > 0 OR m.trigram_similarity > 0)
  ),
  -- Compute max text_rank for normalization (avoids window functions which
  -- trigger a paradedb schema resolution issue in PL/pgSQL on some configs)
  max_text AS (
    SELECT GREATEST(MAX(raw_text_rank), 0.001) AS val FROM merged
  ),
  -- Normalize text_rank and compute combined score with name boost
  scored AS (
    SELECT
      m.place_id,
      -- Normalize text_rank to 0-1 within the result set.
      -- ts_rank_cd() returns ~0.001-0.15 raw; without normalization its
      -- 35% weight contributes almost nothing vs 0-1 trigram/category scores.
      (m.raw_text_rank / mt.val)::FLOAT8 AS text_rank,
      m.trigram_similarity,
      GREATEST(m.category_score, COALESCE(ce.cat_score, 0.0))::FLOAT8 AS category_score,
      (
        -- Base scoring with normalized text rank
        (m.raw_text_rank / mt.val) * 0.35 +
        m.trigram_similarity * 0.25 +
        GREATEST(m.category_score, COALESCE(ce.cat_score, 0.0)) * 0.40 +
        -- Name match boost: quadratic bonus for strong name similarity.
        -- Ensures specific place searches surface the correct place at the
        -- top, while generic queries remain category-dominant.
        CASE
          WHEN m.trigram_similarity >= 0.5
            THEN POWER(m.trigram_similarity, 2) * 0.5
          ELSE 0.0
        END
      )::FLOAT8 AS combined_score
    FROM merged m
    CROSS JOIN max_text mt
    LEFT JOIN category_enrich ce ON m.place_id = ce.place_id
  ),
  deduped AS (
    SELECT DISTINCT ON (place_id)
      place_id, text_rank, trigram_similarity, category_score, combined_score
    FROM scored
    ORDER BY place_id, combined_score DESC
  )
  -- Final join back to full places table (only for the small result set)
  SELECT
    p.id, p.name, p.location,
    p.primary_category, p.categories, p.confidence,
    p.street_address, p.locality, p.region, p.postcode, p.country_code,
    p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
    p.review_count, p.is_verified,
    d.text_rank, d.trigram_similarity, d.category_score, d.combined_score
  FROM deduped d
  JOIN public.places p ON p.id = d.place_id
  WHERE d.combined_score > 0
  ORDER BY d.combined_score DESC, p.rating DESC NULLS LAST
  LIMIT result_limit;
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
-- Name: trigger_recipe_group_embedding_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_recipe_group_embedding_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
-- Name: update_canonical_recipe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_canonical_recipe() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
-- Name: update_tier_list_content_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tier_list_content_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.tier_lists
  SET content_updated_at = NOW()
  WHERE id = COALESCE(NEW.tier_list_id, OLD.tier_list_id);
  RETURN COALESCE(NEW, OLD);
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
-- Name: oauth2_auth_requests; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth2_auth_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    redirect_uri text NOT NULL,
    state text,
    nonce text,
    response_type text NOT NULL,
    code_challenge text,
    code_challenge_method text,
    resource text,
    user_id uuid,
    done boolean DEFAULT false NOT NULL,
    auth_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: oauth2_authorization_codes; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth2_authorization_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash text NOT NULL,
    auth_request_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: oauth2_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth2_clients (
    client_id text DEFAULT auth.generate_oauth2_client_id() NOT NULL,
    client_secret_hash text,
    redirect_uris text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{openid,profile,email,phone,offline_access,graphql}'::text[] NOT NULL,
    type text DEFAULT 'registered'::text NOT NULL,
    metadata jsonb,
    metadata_document_fetched_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth2_clients_type_check CHECK ((type = ANY (ARRAY['registered'::text, 'client_id_metadata_document'::text])))
);


--
-- Name: oauth2_refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth2_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    auth_request_id uuid,
    client_id text NOT NULL,
    user_id uuid NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: pkce_authorization_codes; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.pkce_authorization_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    code_challenge text NOT NULL,
    redirect_to text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_requests; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.provider_requests (
    id uuid NOT NULL,
    options jsonb
);


--
-- Name: providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.providers (
    id text NOT NULL
);


--
-- Name: refresh_token_types; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_token_types (
    value text NOT NULL,
    comment text
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT refresh_tokens_refresh_token_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    user_id uuid NOT NULL,
    metadata jsonb,
    type text DEFAULT 'regular'::text NOT NULL,
    refresh_token_hash character varying(255)
);


--
-- Name: roles; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.roles (
    role text NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


--
-- Name: user_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.user_providers (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    provider_id text NOT NULL,
    provider_user_id text NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.user_roles (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL
);


--
-- Name: user_security_keys; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.user_security_keys (
    id uuid DEFAULT public.gen_random_uuid() CONSTRAINT user_authenticators_id_not_null NOT NULL,
    user_id uuid CONSTRAINT user_authenticators_user_id_not_null NOT NULL,
    credential_id text CONSTRAINT user_authenticators_credential_id_not_null NOT NULL,
    credential_public_key bytea,
    counter bigint DEFAULT 0 CONSTRAINT user_authenticators_counter_not_null NOT NULL,
    transports character varying(255) DEFAULT ''::character varying CONSTRAINT user_authenticators_transports_not_null NOT NULL,
    nickname text
);


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone,
    disabled boolean DEFAULT false NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    avatar_url text DEFAULT ''::text NOT NULL,
    locale character varying(3) NOT NULL,
    email auth.email,
    phone_number text,
    password_hash text,
    email_verified boolean DEFAULT false NOT NULL,
    phone_number_verified boolean DEFAULT false NOT NULL,
    new_email auth.email,
    otp_method_last_used text,
    otp_hash text,
    otp_hash_expires_at timestamp with time zone DEFAULT now() NOT NULL,
    default_role text DEFAULT 'user'::text NOT NULL,
    is_anonymous boolean DEFAULT false NOT NULL,
    totp_secret text,
    active_mfa_type text,
    ticket text,
    ticket_expires_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    webauthn_current_challenge text,
    CONSTRAINT active_mfa_types_check CHECK (((active_mfa_type = 'totp'::text) OR (active_mfa_type = 'sms'::text)))
);


--
-- Name: event_invocation_logs; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.event_invocation_logs (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    trigger_name text,
    event_id text,
    status integer,
    request json,
    response json,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: event_log; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.event_log (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    trigger_name text NOT NULL,
    payload jsonb NOT NULL,
    delivered boolean DEFAULT false NOT NULL,
    error boolean DEFAULT false NOT NULL,
    tries integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    locked timestamp with time zone,
    next_retry_at timestamp without time zone,
    archived boolean DEFAULT false NOT NULL
);


--
-- Name: hdb_action_log; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_action_log (
    id uuid DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    action_name text,
    input_payload jsonb NOT NULL,
    request_headers jsonb NOT NULL,
    session_variables jsonb NOT NULL,
    response_payload jsonb,
    errors jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    response_received_at timestamp with time zone,
    status text NOT NULL,
    CONSTRAINT hdb_action_log_status_check CHECK ((status = ANY (ARRAY['created'::text, 'processing'::text, 'completed'::text, 'error'::text])))
);


--
-- Name: hdb_cron_event_invocation_logs; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_cron_event_invocation_logs (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    event_id text,
    status integer,
    request json,
    response json,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hdb_cron_events; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_cron_events (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    trigger_name text NOT NULL,
    scheduled_time timestamp with time zone NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    tries integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    next_retry_at timestamp with time zone,
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['scheduled'::text, 'locked'::text, 'delivered'::text, 'error'::text, 'dead'::text])))
);


--
-- Name: hdb_event_log_cleanups; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_event_log_cleanups (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    trigger_name text NOT NULL,
    scheduled_at timestamp without time zone NOT NULL,
    deleted_event_logs integer,
    deleted_event_invocation_logs integer,
    status text NOT NULL,
    CONSTRAINT hdb_event_log_cleanups_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'paused'::text, 'completed'::text, 'dead'::text])))
);


--
-- Name: hdb_metadata; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_metadata (
    id integer NOT NULL,
    metadata json NOT NULL,
    resource_version integer DEFAULT 1 NOT NULL
);


--
-- Name: hdb_scheduled_event_invocation_logs; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_scheduled_event_invocation_logs (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    event_id text,
    status integer,
    request json,
    response json,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hdb_scheduled_events; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_scheduled_events (
    id text DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    webhook_conf json NOT NULL,
    scheduled_time timestamp with time zone NOT NULL,
    retry_conf json,
    payload json,
    header_conf json,
    status text DEFAULT 'scheduled'::text NOT NULL,
    tries integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    next_retry_at timestamp with time zone,
    comment text,
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['scheduled'::text, 'locked'::text, 'delivered'::text, 'error'::text, 'dead'::text])))
);


--
-- Name: hdb_schema_notifications; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_schema_notifications (
    id integer NOT NULL,
    notification json NOT NULL,
    resource_version integer DEFAULT 1 NOT NULL,
    instance_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hdb_schema_notifications_id_check CHECK ((id = 1))
);


--
-- Name: hdb_source_catalog_version; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_source_catalog_version (
    version text NOT NULL,
    upgraded_on timestamp with time zone NOT NULL
);


--
-- Name: hdb_version; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_version (
    hasura_uuid uuid DEFAULT hdb_catalog.gen_hasura_uuid() NOT NULL,
    version text NOT NULL,
    upgraded_on timestamp with time zone NOT NULL,
    cli_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    console_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    ee_client_id text,
    ee_client_secret text
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
-- Name: brand_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_types (
    id text CONSTRAINT brand_types_temp_id_not_null NOT NULL,
    comment text
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    brand_type text,
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
    privacy text DEFAULT 'PRIVATE'::text NOT NULL
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
-- Name: coffee_process; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coffee_process (
    value text CONSTRAINT coffee_process_text_not_null NOT NULL,
    comment text
);


--
-- Name: coffee_roast_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coffee_roast_level (
    value text CONSTRAINT coffee_roast_level_text_not_null NOT NULL,
    comment text
);


--
-- Name: coffee_species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coffee_species (
    value text CONSTRAINT coffee_species_text_not_null NOT NULL,
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
    roast_level text,
    country text,
    process text,
    barcode_code text,
    item_onboarding_id uuid CONSTRAINT coffee_item_onboarding_id_not_null NOT NULL,
    species text,
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
-- Name: friend_request_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_request_status (
    value text CONSTRAINT friend_request_status_enum_value_not_null NOT NULL,
    comment text
);


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    status text NOT NULL
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
-- Name: instruction_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instruction_types (
    id text CONSTRAINT instruction_types_temp_id_not_null NOT NULL,
    comment text
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
-- Name: item_brands_detailed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.item_brands_detailed AS
 SELECT ib.id,
    ib.wine_id,
    ib.beer_id,
    ib.spirit_id,
    ib.coffee_id,
    ib.brand_id,
    ib.is_primary,
    b.name AS brand_name,
    b.brand_type,
    b.description AS brand_description,
    w.name AS wine_name,
    be.name AS beer_name,
    s.name AS spirit_name,
    c.name AS coffee_name
   FROM (((((public.item_brands ib
     JOIN public.brands b ON ((ib.brand_id = b.id)))
     LEFT JOIN public.wines w ON ((ib.wine_id = w.id)))
     LEFT JOIN public.beers be ON ((ib.beer_id = be.id)))
     LEFT JOIN public.spirits s ON ((ib.spirit_id = s.id)))
     LEFT JOIN public.coffees c ON ((ib.coffee_id = c.id)));


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
    type text GENERATED ALWAYS AS (
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
    ELSE 'SPIRIT'::text
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
    CONSTRAINT "Score in allowed values" CHECK ((score = ANY ((ARRAY[0.5, (1)::numeric, 1.5, (2)::numeric, 2.5, (3)::numeric, 3.5, (4)::numeric, 4.5, (5)::numeric])::double precision[])))
);


--
-- Name: item_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_type (
    value text CONSTRAINT item_type_enum_value_not_null NOT NULL,
    comment text
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
-- Name: onboarding_reprocess_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_reprocess_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    cursor text,
    filter_ai_model text,
    total_processed integer DEFAULT 0 NOT NULL,
    total_updated integer DEFAULT 0 NOT NULL,
    total_skipped integer DEFAULT 0 NOT NULL,
    total_batches integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skip_reasons jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT onboarding_reprocess_jobs_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: permission_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_type (
    value text CONSTRAINT permission_type_enum_value_not_null NOT NULL,
    comment text
);


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
    menu_item_price money,
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
    CONSTRAINT place_menu_items_detected_item_type_check CHECK ((detected_item_type = ANY (ARRAY['wine'::text, 'beer'::text, 'spirit'::text, 'coffee'::text, 'unknown'::text])))
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
-- Name: place_refresh_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_refresh_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    cursor text,
    total_inserted integer DEFAULT 0 NOT NULL,
    total_batches integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT place_refresh_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
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
-- Name: recipe_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_category (
    value text NOT NULL,
    comment text
);


--
-- Name: recipe_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
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
-- Name: recipe_ingredients_detailed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.recipe_ingredients_detailed AS
 SELECT ri.id,
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
    w.name AS wine_name,
    b.name AS beer_name,
    s.name AS spirit_name,
    c.name AS coffee_name,
    gi.name AS generic_name,
    gi.category AS generic_category
   FROM (((((public.recipe_ingredients ri
     LEFT JOIN public.wines w ON ((ri.wine_id = w.id)))
     LEFT JOIN public.beers b ON ((ri.beer_id = b.id)))
     LEFT JOIN public.spirits s ON ((ri.spirit_id = s.id)))
     LEFT JOIN public.coffees c ON ((ri.coffee_id = c.id)))
     LEFT JOIN public.generic_items gi ON ((ri.generic_item_id = gi.id)));


--
-- Name: recipe_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_instructions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    step_number integer NOT NULL,
    instruction_text text NOT NULL,
    instruction_type text,
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
    CONSTRAINT recipe_reviews_score_range CHECK (((score IS NULL) OR (score = ANY ((ARRAY[0.5, (1)::numeric, 1.5, (2)::numeric, 2.5, (3)::numeric, 3.5, (4)::numeric, 4.5, (5)::numeric])::double precision[]))))
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
-- Name: recipe_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.recipe_summary AS
 SELECT r.id,
    r.name,
    r.type,
    count(ri.id) AS ingredient_count
   FROM (public.recipes r
     LEFT JOIN public.recipe_ingredients ri ON ((r.id = ri.recipe_id)))
  GROUP BY r.id, r.name, r.type;


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
-- Name: sake_serving_temperature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sake_serving_temperature (
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
    serving_temperature text,
    rice_variety text,
    yeast_strain text,
    sake_meter_value numeric(4,2),
    acidity numeric(4,2),
    amino_acid numeric(4,2),
    vintage integer,
    country text DEFAULT 'Japan'::text,
    barcode_code text,
    item_onboarding_id uuid
);


--
-- Name: spirit_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spirit_type (
    value text CONSTRAINT spirit_type_text_not_null NOT NULL,
    comment text
);


--
-- Name: tea_caffeine_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tea_caffeine_level (
    value text NOT NULL,
    comment text
);


--
-- Name: tea_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tea_category (
    value text NOT NULL,
    comment text
);


--
-- Name: tea_form; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tea_form (
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
    form text,
    caffeine_level text,
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
    privacy text DEFAULT 'PRIVATE'::text NOT NULL,
    list_type text DEFAULT 'place'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    content_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_insights jsonb,
    insights_generated_at timestamp with time zone,
    is_editing_locked boolean DEFAULT false NOT NULL
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
-- Name: oauth2_auth_requests oauth2_auth_requests_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_auth_requests
    ADD CONSTRAINT oauth2_auth_requests_pkey PRIMARY KEY (id);


--
-- Name: oauth2_authorization_codes oauth2_authorization_codes_code_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_authorization_codes
    ADD CONSTRAINT oauth2_authorization_codes_code_hash_key UNIQUE (code_hash);


--
-- Name: oauth2_authorization_codes oauth2_authorization_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_authorization_codes
    ADD CONSTRAINT oauth2_authorization_codes_pkey PRIMARY KEY (id);


--
-- Name: oauth2_clients oauth2_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_clients
    ADD CONSTRAINT oauth2_clients_pkey PRIMARY KEY (client_id);


--
-- Name: oauth2_refresh_tokens oauth2_refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_refresh_tokens
    ADD CONSTRAINT oauth2_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: oauth2_refresh_tokens oauth2_refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_refresh_tokens
    ADD CONSTRAINT oauth2_refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: pkce_authorization_codes pkce_authorization_codes_code_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.pkce_authorization_codes
    ADD CONSTRAINT pkce_authorization_codes_code_hash_key UNIQUE (code_hash);


--
-- Name: pkce_authorization_codes pkce_authorization_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.pkce_authorization_codes
    ADD CONSTRAINT pkce_authorization_codes_pkey PRIMARY KEY (id);


--
-- Name: provider_requests provider_requests_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.provider_requests
    ADD CONSTRAINT provider_requests_pkey PRIMARY KEY (id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: refresh_token_types refresh_token_types_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_token_types
    ADD CONSTRAINT refresh_token_types_pkey PRIMARY KEY (value);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: user_providers user_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_providers
    ADD CONSTRAINT user_providers_pkey PRIMARY KEY (id);


--
-- Name: user_providers user_providers_provider_id_provider_user_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_providers
    ADD CONSTRAINT user_providers_provider_id_provider_user_id_key UNIQUE (provider_id, provider_user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_security_keys user_security_key_credential_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_security_keys
    ADD CONSTRAINT user_security_key_credential_id_key UNIQUE (credential_id);


--
-- Name: user_security_keys user_security_keys_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_security_keys
    ADD CONSTRAINT user_security_keys_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_phone_number_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: event_invocation_logs event_invocation_logs_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_invocation_logs
    ADD CONSTRAINT event_invocation_logs_pkey PRIMARY KEY (id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: hdb_action_log hdb_action_log_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_action_log
    ADD CONSTRAINT hdb_action_log_pkey PRIMARY KEY (id);


--
-- Name: hdb_cron_event_invocation_logs hdb_cron_event_invocation_logs_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_cron_event_invocation_logs
    ADD CONSTRAINT hdb_cron_event_invocation_logs_pkey PRIMARY KEY (id);


--
-- Name: hdb_cron_events hdb_cron_events_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_cron_events
    ADD CONSTRAINT hdb_cron_events_pkey PRIMARY KEY (id);


--
-- Name: hdb_event_log_cleanups hdb_event_log_cleanups_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_event_log_cleanups
    ADD CONSTRAINT hdb_event_log_cleanups_pkey PRIMARY KEY (id);


--
-- Name: hdb_event_log_cleanups hdb_event_log_cleanups_trigger_name_scheduled_at_key; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_event_log_cleanups
    ADD CONSTRAINT hdb_event_log_cleanups_trigger_name_scheduled_at_key UNIQUE (trigger_name, scheduled_at);


--
-- Name: hdb_metadata hdb_metadata_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_metadata
    ADD CONSTRAINT hdb_metadata_pkey PRIMARY KEY (id);


--
-- Name: hdb_metadata hdb_metadata_resource_version_key; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_metadata
    ADD CONSTRAINT hdb_metadata_resource_version_key UNIQUE (resource_version);


--
-- Name: hdb_scheduled_event_invocation_logs hdb_scheduled_event_invocation_logs_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_scheduled_event_invocation_logs
    ADD CONSTRAINT hdb_scheduled_event_invocation_logs_pkey PRIMARY KEY (id);


--
-- Name: hdb_scheduled_events hdb_scheduled_events_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_scheduled_events
    ADD CONSTRAINT hdb_scheduled_events_pkey PRIMARY KEY (id);


--
-- Name: hdb_schema_notifications hdb_schema_notifications_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_schema_notifications
    ADD CONSTRAINT hdb_schema_notifications_pkey PRIMARY KEY (id);


--
-- Name: hdb_version hdb_version_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_version
    ADD CONSTRAINT hdb_version_pkey PRIMARY KEY (hasura_uuid);


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
-- Name: brand_types brand_types_temp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_types
    ADD CONSTRAINT brand_types_temp_pkey PRIMARY KEY (id);


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
-- Name: coffees coffee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffee_pkey PRIMARY KEY (id);


--
-- Name: coffee_process coffee_process_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffee_process
    ADD CONSTRAINT coffee_process_enum_pkey PRIMARY KEY (value);


--
-- Name: coffee_roast_level coffee_roast_level_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffee_roast_level
    ADD CONSTRAINT coffee_roast_level_enum_pkey PRIMARY KEY (value);


--
-- Name: coffee_species coffee_species_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffee_species
    ADD CONSTRAINT coffee_species_enum_pkey PRIMARY KEY (value);


--
-- Name: country country_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_enum_pkey PRIMARY KEY (value);


--
-- Name: friend_request_status friend_request_status_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_request_status
    ADD CONSTRAINT friend_request_status_enum_pkey PRIMARY KEY (value);


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
-- Name: instruction_types instruction_types_temp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instruction_types
    ADD CONSTRAINT instruction_types_temp_pkey PRIMARY KEY (id);


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
-- Name: item_favorites item_favorites_user_id_spirit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_spirit_id_key UNIQUE (user_id, spirit_id);


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
-- Name: item_type item_type_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_type
    ADD CONSTRAINT item_type_enum_pkey PRIMARY KEY (value);


--
-- Name: item_vectors item_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_pkey PRIMARY KEY (id);


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
-- Name: onboarding_reprocess_jobs onboarding_reprocess_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_reprocess_jobs
    ADD CONSTRAINT onboarding_reprocess_jobs_pkey PRIMARY KEY (id);


--
-- Name: permission_type permission_type_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_type
    ADD CONSTRAINT permission_type_enum_pkey PRIMARY KEY (value);


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
-- Name: place_refresh_jobs place_refresh_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_refresh_jobs
    ADD CONSTRAINT place_refresh_jobs_pkey PRIMARY KEY (id);


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
-- Name: recipe_category recipe_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_category
    ADD CONSTRAINT recipe_category_pkey PRIMARY KEY (value);


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
-- Name: sake_serving_temperature sake_serving_temperature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sake_serving_temperature
    ADD CONSTRAINT sake_serving_temperature_pkey PRIMARY KEY (value);


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
-- Name: tea_caffeine_level tea_caffeine_level_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tea_caffeine_level
    ADD CONSTRAINT tea_caffeine_level_pkey PRIMARY KEY (value);


--
-- Name: tea_category tea_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tea_category
    ADD CONSTRAINT tea_category_pkey PRIMARY KEY (value);


--
-- Name: tea_form tea_form_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tea_form
    ADD CONSTRAINT tea_form_pkey PRIMARY KEY (value);


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
-- Name: user_place_interactions user_place_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT user_place_interactions_pkey PRIMARY KEY (id);


--
-- Name: wine_style wine_style_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wine_style
    ADD CONSTRAINT wine_style_enum_pkey PRIMARY KEY (value);


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
-- Name: oauth2_auth_requests_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_auth_requests_client_id_idx ON auth.oauth2_auth_requests USING btree (client_id);


--
-- Name: oauth2_auth_requests_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_auth_requests_expires_at_idx ON auth.oauth2_auth_requests USING btree (expires_at);


--
-- Name: oauth2_auth_requests_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_auth_requests_user_id_idx ON auth.oauth2_auth_requests USING btree (user_id);


--
-- Name: oauth2_authorization_codes_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_authorization_codes_expires_at_idx ON auth.oauth2_authorization_codes USING btree (expires_at);


--
-- Name: oauth2_clients_created_by_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_clients_created_by_idx ON auth.oauth2_clients USING btree (created_by);


--
-- Name: oauth2_refresh_tokens_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_refresh_tokens_client_id_idx ON auth.oauth2_refresh_tokens USING btree (client_id);


--
-- Name: oauth2_refresh_tokens_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_refresh_tokens_expires_at_idx ON auth.oauth2_refresh_tokens USING btree (expires_at);


--
-- Name: oauth2_refresh_tokens_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth2_refresh_tokens_user_id_idx ON auth.oauth2_refresh_tokens USING btree (user_id);


--
-- Name: pkce_authorization_codes_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX pkce_authorization_codes_expires_at_idx ON auth.pkce_authorization_codes USING btree (expires_at);


--
-- Name: refresh_tokens_refresh_token_hash_expires_at_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_refresh_token_hash_expires_at_user_id_idx ON auth.refresh_tokens USING btree (refresh_token_hash, expires_at, user_id);


--
-- Name: event_invocation_logs_event_id_idx; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX event_invocation_logs_event_id_idx ON hdb_catalog.event_invocation_logs USING btree (event_id);


--
-- Name: event_log_fetch_events; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX event_log_fetch_events ON hdb_catalog.event_log USING btree (locked NULLS FIRST, next_retry_at NULLS FIRST, created_at) WHERE ((delivered = false) AND (error = false) AND (archived = false));


--
-- Name: event_log_trigger_name_idx; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX event_log_trigger_name_idx ON hdb_catalog.event_log USING btree (trigger_name);


--
-- Name: hdb_cron_event_invocation_event_id; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX hdb_cron_event_invocation_event_id ON hdb_catalog.hdb_cron_event_invocation_logs USING btree (event_id);


--
-- Name: hdb_cron_event_status; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX hdb_cron_event_status ON hdb_catalog.hdb_cron_events USING btree (status);


--
-- Name: hdb_cron_events_unique_scheduled; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE UNIQUE INDEX hdb_cron_events_unique_scheduled ON hdb_catalog.hdb_cron_events USING btree (trigger_name, scheduled_time) WHERE (status = 'scheduled'::text);


--
-- Name: hdb_scheduled_event_status; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX hdb_scheduled_event_status ON hdb_catalog.hdb_scheduled_events USING btree (status);


--
-- Name: hdb_source_catalog_version_one_row; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE UNIQUE INDEX hdb_source_catalog_version_one_row ON hdb_catalog.hdb_source_catalog_version USING btree (((version IS NOT NULL)));


--
-- Name: hdb_version_one_row; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE UNIQUE INDEX hdb_version_one_row ON hdb_catalog.hdb_version USING btree (((version IS NOT NULL)));


--
-- Name: brands_unique_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brands_unique_lower_name ON public.brands USING btree (lower(name));


--
-- Name: idx_api_usage_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_usage_log_created_at ON public.api_usage_log USING btree (created_at);


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

CREATE INDEX idx_cellars_privacy_public ON public.cellars USING btree (id) WHERE (privacy = 'PUBLIC'::text);


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
-- Name: idx_place_search_results_cluster; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_search_results_cluster ON public.place_search_results USING btree (is_cluster, cluster_id);


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
-- Name: places_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX places_created_by_idx ON public.places USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: places_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX places_source_idx ON public.places USING btree (source);


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
-- Name: oauth2_clients check_oauth2_client_secret_hash; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER check_oauth2_client_secret_hash BEFORE INSERT OR UPDATE ON auth.oauth2_clients FOR EACH ROW EXECUTE FUNCTION auth.check_oauth2_client_secret_hash();


--
-- Name: oauth2_clients set_auth_oauth2_clients_updated_at; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER set_auth_oauth2_clients_updated_at BEFORE UPDATE ON auth.oauth2_clients FOR EACH ROW EXECUTE FUNCTION auth.set_current_timestamp_updated_at();


--
-- Name: user_providers set_auth_user_providers_updated_at; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER set_auth_user_providers_updated_at BEFORE UPDATE ON auth.user_providers FOR EACH ROW EXECUTE FUNCTION auth.set_current_timestamp_updated_at();


--
-- Name: users set_auth_users_updated_at; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER set_auth_users_updated_at BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.set_current_timestamp_updated_at();


--
-- Name: oauth2_auth_requests validate_oauth2_auth_requests_scopes; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER validate_oauth2_auth_requests_scopes BEFORE INSERT OR UPDATE ON auth.oauth2_auth_requests FOR EACH ROW EXECUTE FUNCTION auth.validate_oauth2_scopes();


--
-- Name: oauth2_clients validate_oauth2_clients_scopes; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER validate_oauth2_clients_scopes BEFORE INSERT OR UPDATE ON auth.oauth2_clients FOR EACH ROW EXECUTE FUNCTION auth.validate_oauth2_scopes();


--
-- Name: oauth2_refresh_tokens validate_oauth2_refresh_tokens_scopes; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER validate_oauth2_refresh_tokens_scopes BEFORE INSERT OR UPDATE ON auth.oauth2_refresh_tokens FOR EACH ROW EXECUTE FUNCTION auth.validate_oauth2_scopes();


--
-- Name: friend_requests notify_hasura_friend_request_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_friend_request_UPDATE" AFTER UPDATE ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_friend_request_UPDATE"();


--
-- Name: coffees notify_hasura_generate_coffee_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_coffee_vector_INSERT" AFTER INSERT ON public.coffees FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_coffee_vector_INSERT"();


--
-- Name: coffees notify_hasura_generate_coffee_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_coffee_vector_UPDATE" AFTER UPDATE ON public.coffees FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_coffee_vector_UPDATE"();


--
-- Name: item_image notify_hasura_generate_item_image_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_item_image_vector_INSERT" AFTER INSERT ON public.item_image FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_item_image_vector_INSERT"();


--
-- Name: recipes notify_hasura_generate_recipe_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_recipe_vector_INSERT" AFTER INSERT ON public.recipes FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_recipe_vector_INSERT"();


--
-- Name: recipes notify_hasura_generate_recipe_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_recipe_vector_UPDATE" AFTER UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_recipe_vector_UPDATE"();


--
-- Name: sakes notify_hasura_generate_sake_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_sake_vector_INSERT" AFTER INSERT ON public.sakes FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_sake_vector_INSERT"();


--
-- Name: sakes notify_hasura_generate_sake_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_sake_vector_UPDATE" AFTER UPDATE ON public.sakes FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_sake_vector_UPDATE"();


--
-- Name: spirits notify_hasura_generate_spirit_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_spirit_vector_INSERT" AFTER INSERT ON public.spirits FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_spirit_vector_INSERT"();


--
-- Name: spirits notify_hasura_generate_spirit_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_spirit_vector_UPDATE" AFTER UPDATE ON public.spirits FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_spirit_vector_UPDATE"();


--
-- Name: teas notify_hasura_generate_tea_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_tea_vector_INSERT" AFTER INSERT ON public.teas FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_tea_vector_INSERT"();


--
-- Name: teas notify_hasura_generate_tea_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_tea_vector_UPDATE" AFTER UPDATE ON public.teas FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_tea_vector_UPDATE"();


--
-- Name: tier_lists notify_hasura_generate_tier_list_insights_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_tier_list_insights_UPDATE" AFTER UPDATE ON public.tier_lists FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_tier_list_insights_UPDATE"();


--
-- Name: beers notify_hasura_generate_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_vector_INSERT" AFTER INSERT ON public.beers FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_vector_INSERT"();


--
-- Name: beers notify_hasura_generate_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_vector_UPDATE" AFTER UPDATE ON public.beers FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_vector_UPDATE"();


--
-- Name: wines notify_hasura_generate_wine_vector_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_wine_vector_INSERT" AFTER INSERT ON public.wines FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_wine_vector_INSERT"();


--
-- Name: wines notify_hasura_generate_wine_vector_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_generate_wine_vector_UPDATE" AFTER UPDATE ON public.wines FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_generate_wine_vector_UPDATE"();


--
-- Name: menu_scans notify_hasura_match_menu_items_on_scan_complete_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_match_menu_items_on_scan_complete_UPDATE" AFTER UPDATE ON public.menu_scans FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_match_menu_items_on_scan_complete_UPDATE"();


--
-- Name: onboarding_reprocess_jobs notify_hasura_process_onboarding_reprocess_batch_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_process_onboarding_reprocess_batch_INSERT" AFTER INSERT ON public.onboarding_reprocess_jobs FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_process_onboarding_reprocess_batch_INSERT"();


--
-- Name: onboarding_reprocess_jobs notify_hasura_process_onboarding_reprocess_batch_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_process_onboarding_reprocess_batch_UPDATE" AFTER UPDATE ON public.onboarding_reprocess_jobs FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_process_onboarding_reprocess_batch_UPDATE"();


--
-- Name: place_refresh_jobs notify_hasura_process_place_refresh_batch_INSERT; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_process_place_refresh_batch_INSERT" AFTER INSERT ON public.place_refresh_jobs FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_process_place_refresh_batch_INSERT"();


--
-- Name: place_refresh_jobs notify_hasura_process_place_refresh_batch_UPDATE; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "notify_hasura_process_place_refresh_batch_UPDATE" AFTER UPDATE ON public.place_refresh_jobs FOR EACH ROW EXECUTE FUNCTION hdb_catalog."notify_hasura_process_place_refresh_batch_UPDATE"();


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
-- Name: place_refresh_jobs set_public_place_refresh_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_public_place_refresh_jobs_updated_at BEFORE UPDATE ON public.place_refresh_jobs FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();


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
-- Name: tier_list_items tier_list_items_content_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tier_list_items_content_changed AFTER INSERT OR DELETE OR UPDATE ON public.tier_list_items FOR EACH ROW EXECUTE FUNCTION public.update_tier_list_content_timestamp();


--
-- Name: category_vectors trg_category_vectors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_category_vectors_updated_at BEFORE UPDATE ON public.category_vectors FOR EACH ROW EXECUTE FUNCTION public.update_category_vectors_updated_at();


--
-- Name: places trg_places_search_text; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_places_search_text BEFORE INSERT OR UPDATE OF name, categories, locality ON public.places FOR EACH ROW EXECUTE FUNCTION public.update_places_search_text();


--
-- Name: recipe_groups trigger_recipe_group_embedding_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recipe_group_embedding_update BEFORE UPDATE ON public.recipe_groups FOR EACH ROW EXECUTE FUNCTION public.trigger_recipe_group_embedding_update();


--
-- Name: recipe_votes trigger_update_canonical_recipe_on_vote_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_canonical_recipe_on_vote_delete AFTER DELETE ON public.recipe_votes FOR EACH ROW EXECUTE FUNCTION public.update_canonical_recipe();


--
-- Name: recipe_votes trigger_update_canonical_recipe_on_vote_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_canonical_recipe_on_vote_insert AFTER INSERT ON public.recipe_votes FOR EACH ROW EXECUTE FUNCTION public.update_canonical_recipe();


--
-- Name: recipe_votes trigger_update_canonical_recipe_on_vote_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_canonical_recipe_on_vote_update AFTER UPDATE ON public.recipe_votes FOR EACH ROW EXECUTE FUNCTION public.update_canonical_recipe();


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
-- Name: users fk_default_role; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT fk_default_role FOREIGN KEY (default_role) REFERENCES auth.roles(role) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: oauth2_auth_requests fk_oauth2_auth_requests_client; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_auth_requests
    ADD CONSTRAINT fk_oauth2_auth_requests_client FOREIGN KEY (client_id) REFERENCES auth.oauth2_clients(client_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: oauth2_auth_requests fk_oauth2_auth_requests_user; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_auth_requests
    ADD CONSTRAINT fk_oauth2_auth_requests_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: oauth2_authorization_codes fk_oauth2_authorization_codes_auth_request; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_authorization_codes
    ADD CONSTRAINT fk_oauth2_authorization_codes_auth_request FOREIGN KEY (auth_request_id) REFERENCES auth.oauth2_auth_requests(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: oauth2_clients fk_oauth2_clients_created_by; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_clients
    ADD CONSTRAINT fk_oauth2_clients_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: oauth2_refresh_tokens fk_oauth2_refresh_tokens_auth_request; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_refresh_tokens
    ADD CONSTRAINT fk_oauth2_refresh_tokens_auth_request FOREIGN KEY (auth_request_id) REFERENCES auth.oauth2_auth_requests(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: oauth2_refresh_tokens fk_oauth2_refresh_tokens_client; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_refresh_tokens
    ADD CONSTRAINT fk_oauth2_refresh_tokens_client FOREIGN KEY (client_id) REFERENCES auth.oauth2_clients(client_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: oauth2_refresh_tokens fk_oauth2_refresh_tokens_user; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth2_refresh_tokens
    ADD CONSTRAINT fk_oauth2_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_providers fk_provider; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_providers
    ADD CONSTRAINT fk_provider FOREIGN KEY (provider_id) REFERENCES auth.providers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles fk_role; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT fk_role FOREIGN KEY (role) REFERENCES auth.roles(role) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refresh_tokens fk_user; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_providers fk_user; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_providers
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_roles fk_user; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_security_keys fk_user; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_security_keys
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pkce_authorization_codes pkce_authorization_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.pkce_authorization_codes
    ADD CONSTRAINT pkce_authorization_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_types_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_types_fkey FOREIGN KEY (type) REFERENCES auth.refresh_token_types(value) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: hdb_cron_event_invocation_logs hdb_cron_event_invocation_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_cron_event_invocation_logs
    ADD CONSTRAINT hdb_cron_event_invocation_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES hdb_catalog.hdb_cron_events(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hdb_scheduled_event_invocation_logs hdb_scheduled_event_invocation_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_scheduled_event_invocation_logs
    ADD CONSTRAINT hdb_scheduled_event_invocation_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES hdb_catalog.hdb_scheduled_events(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: beers beers_barcode_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_barcode_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: beers beers_country_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: beers beers_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: beers beers_item_onboarding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_item_onboarding_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: beers beers_style_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_style_fkey FOREIGN KEY (style) REFERENCES public.beer_style(value);


--
-- Name: brands brands_parent_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_parent_brand_id_fkey FOREIGN KEY (parent_brand_id) REFERENCES public.brands(id);


--
-- Name: cellar_items cellar_items_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_cellar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_cellar_id_fkey FOREIGN KEY (cellar_id) REFERENCES public.cellars(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_display_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_display_image_id_fkey FOREIGN KEY (display_image_id) REFERENCES public.item_image(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: cellar_items cellar_items_source_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_source_menu_item_id_fkey FOREIGN KEY (source_menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE SET NULL;


--
-- Name: cellar_items cellar_items_source_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_source_place_id_fkey FOREIGN KEY (source_place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: cellar_items cellar_items_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_items cellar_items_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: cellar_items cellar_items_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_items
    ADD CONSTRAINT cellar_items_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_owners cellar_owners_cellar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_owners
    ADD CONSTRAINT cellar_owners_cellar_id_fkey FOREIGN KEY (cellar_id) REFERENCES public.cellars(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellar_owners cellar_owners_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellar_owners
    ADD CONSTRAINT cellar_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellars cellars_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellars
    ADD CONSTRAINT cellars_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: cellars cellars_privacy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cellars
    ADD CONSTRAINT cellars_privacy_fkey FOREIGN KEY (privacy) REFERENCES public.permission_type(value);


--
-- Name: check_ins check_ins_cellar_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_cellar_item_id_fkey FOREIGN KEY (cellar_item_id) REFERENCES public.cellar_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: check_ins check_ins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffee_barcode_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffee_barcode_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffee_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffee_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffee_item_onboarding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffee_item_onboarding_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: coffees coffees_country_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: coffees coffees_cultivar_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_cultivar_fkey FOREIGN KEY (cultivar) REFERENCES public.coffee_cultivar(value);


--
-- Name: coffees coffees_process_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_process_fkey FOREIGN KEY (process) REFERENCES public.coffee_process(value);


--
-- Name: coffees coffees_roast_level_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_roast_level_fkey FOREIGN KEY (roast_level) REFERENCES public.coffee_roast_level(value);


--
-- Name: coffees coffees_species_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coffees
    ADD CONSTRAINT coffees_species_fkey FOREIGN KEY (species) REFERENCES public.coffee_species(value);


--
-- Name: brands fk_brand_type; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT fk_brand_type FOREIGN KEY (brand_type) REFERENCES public.brand_types(id);


--
-- Name: recipe_instructions fk_instruction_type; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_instructions
    ADD CONSTRAINT fk_instruction_type FOREIGN KEY (instruction_type) REFERENCES public.instruction_types(id);


--
-- Name: friend_requests friend_requests_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friend_requests friend_requests_status_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_status_fkey FOREIGN KEY (status) REFERENCES public.friend_request_status(value);


--
-- Name: friend_requests friend_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friends friends_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: friends friends_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: generic_items generic_items_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generic_items
    ADD CONSTRAINT generic_items_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: item_brands item_brands_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id);


--
-- Name: item_brands item_brands_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: item_brands item_brands_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id);


--
-- Name: item_brands item_brands_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_brands item_brands_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id);


--
-- Name: item_brands item_brands_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_brands item_brands_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_brands
    ADD CONSTRAINT item_brands_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id);


--
-- Name: item_favorites item_favorites_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_favorites item_favorites_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_favorites item_favorites_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_type_fkey FOREIGN KEY (type) REFERENCES public.item_type(value);


--
-- Name: item_favorites item_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_favorites item_favorites_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_favorites
    ADD CONSTRAINT item_favorites_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_file_id_fkey FOREIGN KEY (file_id) REFERENCES storage.files(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_image item_image_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_image item_image_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_image item_image_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_image
    ADD CONSTRAINT item_image_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_match_suggestions item_match_suggestions_acted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_acted_by_fkey FOREIGN KEY (acted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: item_match_suggestions item_match_suggestions_place_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_place_menu_item_id_fkey FOREIGN KEY (place_menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_beer_id_fkey FOREIGN KEY (suggested_beer_id) REFERENCES public.beers(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_coffee_id_fkey FOREIGN KEY (suggested_coffee_id) REFERENCES public.coffees(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_recipe_id_fkey FOREIGN KEY (suggested_recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_sake_id_fkey FOREIGN KEY (suggested_sake_id) REFERENCES public.sakes(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_spirit_id_fkey FOREIGN KEY (suggested_spirit_id) REFERENCES public.spirits(id) ON DELETE CASCADE;


--
-- Name: item_match_suggestions item_match_suggestions_suggested_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_tea_id_fkey FOREIGN KEY (suggested_tea_id) REFERENCES public.teas(id);


--
-- Name: item_match_suggestions item_match_suggestions_suggested_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_match_suggestions
    ADD CONSTRAINT item_match_suggestions_suggested_wine_id_fkey FOREIGN KEY (suggested_wine_id) REFERENCES public.wines(id) ON DELETE CASCADE;


--
-- Name: item_onboardings item_onboardings_back_label_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_back_label_image_id_fkey FOREIGN KEY (back_label_image_id) REFERENCES storage.files(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_onboardings item_onboardings_front_label_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_front_label_image_id_fkey FOREIGN KEY (front_label_image_id) REFERENCES storage.files(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_onboardings item_onboardings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_onboardings
    ADD CONSTRAINT item_onboardings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_reviews item_reviews_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_reviews item_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_reviews item_reviews_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_reviews
    ADD CONSTRAINT item_reviews_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: item_vectors item_vectors_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: item_vectors item_vectors_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: item_vectors item_vectors_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_vectors
    ADD CONSTRAINT item_vectors_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: menu_item_recipes menu_item_recipes_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_recipes
    ADD CONSTRAINT menu_item_recipes_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.place_menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_recipes menu_item_recipes_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_recipes
    ADD CONSTRAINT menu_item_recipes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: menu_scans menu_scans_estimated_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_estimated_place_id_fkey FOREIGN KEY (estimated_place_id) REFERENCES public.places(id);


--
-- Name: menu_scans menu_scans_manual_place_override_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_manual_place_override_fkey FOREIGN KEY (manual_place_override) REFERENCES public.places(id);


--
-- Name: menu_scans menu_scans_original_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_original_image_id_fkey FOREIGN KEY (original_image_id) REFERENCES storage.files(id);


--
-- Name: menu_scans menu_scans_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: menu_scans menu_scans_processed_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_processed_image_id_fkey FOREIGN KEY (processed_image_id) REFERENCES storage.files(id);


--
-- Name: menu_scans menu_scans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_scans
    ADD CONSTRAINT menu_scans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: place_brands place_brands_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_brands
    ADD CONSTRAINT place_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: place_brands place_brands_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_brands
    ADD CONSTRAINT place_brands_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_google_enrichments place_google_enrichments_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_enrichments
    ADD CONSTRAINT place_google_enrichments_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_google_photos place_google_photos_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_photos
    ADD CONSTRAINT place_google_photos_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_google_photos place_google_photos_storage_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_google_photos
    ADD CONSTRAINT place_google_photos_storage_file_id_fkey FOREIGN KEY (storage_file_id) REFERENCES storage.files(id);


--
-- Name: place_menu_items place_menu_items_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE SET NULL;


--
-- Name: place_menu_items place_menu_items_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id) ON DELETE SET NULL;


--
-- Name: place_menu_items place_menu_items_match_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_match_verified_by_fkey FOREIGN KEY (match_verified_by) REFERENCES auth.users(id);


--
-- Name: place_menu_items place_menu_items_menu_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_menu_scan_id_fkey FOREIGN KEY (menu_scan_id) REFERENCES public.menu_scans(id) ON DELETE CASCADE;


--
-- Name: place_menu_items place_menu_items_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_menu_items place_menu_items_place_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_place_menu_id_fkey FOREIGN KEY (place_menu_id) REFERENCES public.place_menus(id) ON DELETE CASCADE;


--
-- Name: place_menu_items place_menu_items_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id) ON DELETE SET NULL;


--
-- Name: place_menu_items place_menu_items_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menu_items
    ADD CONSTRAINT place_menu_items_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE SET NULL;


--
-- Name: place_menus place_menus_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: place_menus place_menus_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_menus place_menus_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_menus
    ADD CONSTRAINT place_menus_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: place_vectors place_vectors_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_vectors
    ADD CONSTRAINT place_vectors_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: places places_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: recipe_groups recipe_groups_canonical_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_groups
    ADD CONSTRAINT recipe_groups_canonical_recipe_id_fkey FOREIGN KEY (canonical_recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;


--
-- Name: recipe_groups recipe_groups_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_groups
    ADD CONSTRAINT recipe_groups_category_fkey FOREIGN KEY (category) REFERENCES public.recipe_category(value) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: recipe_groups recipe_groups_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_groups
    ADD CONSTRAINT recipe_groups_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recipe_ingredients recipe_ingredients_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id);


--
-- Name: recipe_ingredients recipe_ingredients_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id);


--
-- Name: recipe_ingredients recipe_ingredients_generic_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_generic_item_id_fkey FOREIGN KEY (generic_item_id) REFERENCES public.generic_items(id);


--
-- Name: recipe_ingredients recipe_ingredients_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_ingredients recipe_ingredients_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: recipe_ingredients recipe_ingredients_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id);


--
-- Name: recipe_ingredients recipe_ingredients_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: recipe_ingredients recipe_ingredients_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id);


--
-- Name: recipe_instructions recipe_instructions_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_instructions
    ADD CONSTRAINT recipe_instructions_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_reviews recipe_reviews_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_reviews
    ADD CONSTRAINT recipe_reviews_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: recipe_reviews recipe_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_reviews
    ADD CONSTRAINT recipe_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: recipe_vectors recipe_vectors_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_vectors
    ADD CONSTRAINT recipe_vectors_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: recipe_votes recipe_votes_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_votes
    ADD CONSTRAINT recipe_votes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_votes recipe_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_votes
    ADD CONSTRAINT recipe_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_canonical_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_canonical_recipe_id_fkey FOREIGN KEY (canonical_recipe_id) REFERENCES public.recipes(id);


--
-- Name: recipes recipes_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recipes recipes_recipe_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_recipe_group_id_fkey FOREIGN KEY (recipe_group_id) REFERENCES public.recipe_groups(id) ON DELETE SET NULL;


--
-- Name: sakes sakes_barcode_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_barcode_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code);


--
-- Name: sakes sakes_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_category_fkey FOREIGN KEY (category) REFERENCES public.sake_category(value);


--
-- Name: sakes sakes_country_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: sakes sakes_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id);


--
-- Name: sakes sakes_rice_variety_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_rice_variety_fkey FOREIGN KEY (rice_variety) REFERENCES public.sake_rice_variety(value);


--
-- Name: sakes sakes_serving_temperature_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_serving_temperature_fkey FOREIGN KEY (serving_temperature) REFERENCES public.sake_serving_temperature(value);


--
-- Name: sakes sakes_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sakes
    ADD CONSTRAINT sakes_type_fkey FOREIGN KEY (type) REFERENCES public.sake_type(value);


--
-- Name: spirits spirits_barcode_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_barcode_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: spirits spirits_country_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: spirits spirits_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: spirits spirits_item_onboarding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_item_onboarding_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: spirits spirits_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spirits
    ADD CONSTRAINT spirits_type_fkey FOREIGN KEY (type) REFERENCES public.spirit_type(value);


--
-- Name: teas teas_barcode_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_barcode_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code);


--
-- Name: teas teas_caffeine_level_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_caffeine_level_fkey FOREIGN KEY (caffeine_level) REFERENCES public.tea_caffeine_level(value);


--
-- Name: teas teas_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_category_fkey FOREIGN KEY (category) REFERENCES public.tea_category(value);


--
-- Name: teas teas_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id);


--
-- Name: teas teas_form_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_form_fkey FOREIGN KEY (form) REFERENCES public.tea_form(value);


--
-- Name: tier_list_items tier_list_items_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id);


--
-- Name: tier_list_items tier_list_items_coffee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_coffee_id_fkey FOREIGN KEY (coffee_id) REFERENCES public.coffees(id);


--
-- Name: tier_list_items tier_list_items_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id);


--
-- Name: tier_list_items tier_list_items_sake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_sake_id_fkey FOREIGN KEY (sake_id) REFERENCES public.sakes(id);


--
-- Name: tier_list_items tier_list_items_spirit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_spirit_id_fkey FOREIGN KEY (spirit_id) REFERENCES public.spirits(id);


--
-- Name: tier_list_items tier_list_items_tea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);


--
-- Name: tier_list_items tier_list_items_tier_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_tier_list_id_fkey FOREIGN KEY (tier_list_id) REFERENCES public.tier_lists(id) ON DELETE CASCADE;


--
-- Name: tier_list_items tier_list_items_wine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_list_items
    ADD CONSTRAINT tier_list_items_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES public.wines(id);


--
-- Name: tier_lists tier_lists_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id);


--
-- Name: tier_lists tier_lists_privacy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_privacy_fkey FOREIGN KEY (privacy) REFERENCES public.permission_type(value);


--
-- Name: user_place_interactions user_place_interactions_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT user_place_interactions_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: user_place_interactions user_place_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_place_interactions
    ADD CONSTRAINT user_place_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wines wines_barcode_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_barcode_code_fkey FOREIGN KEY (barcode_code) REFERENCES public.barcodes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: wines wines_country_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_country_fkey FOREIGN KEY (country) REFERENCES public.country(value);


--
-- Name: wines wines_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: wines wines_item_onboarding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_item_onboarding_id_fkey FOREIGN KEY (item_onboarding_id) REFERENCES public.item_onboardings(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: wines wines_style_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_style_fkey FOREIGN KEY (style) REFERENCES public.wine_style(value);


--
-- Name: wines wines_variety_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wines
    ADD CONSTRAINT wines_variety_fkey FOREIGN KEY (variety) REFERENCES public.wine_variety(value);


--
-- Name: files fk_bucket; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.files
    ADD CONSTRAINT fk_bucket FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: virus virus_file_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.virus
    ADD CONSTRAINT virus_file_id_fkey FOREIGN KEY (file_id) REFERENCES storage.files(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 3E5CmGNbiYPkPVgiaptY68Oh4s0kcm4YlqaZxuqRx0EkcHwnbAF1Foiqc99cBO8

