-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "item_type" AS ENUM('BEER', 'COFFEE', 'SAKE', 'SPIRIT', 'TEA', 'WINE');--> statement-breakpoint
CREATE TYPE "permission_type" AS ENUM('FRIENDS', 'PRIVATE', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "friend_request_status" AS ENUM('ACCEPTED', 'PENDING');--> statement-breakpoint
CREATE TYPE "instruction_types" AS ENUM('chill', 'cook', 'garnish', 'mix', 'prep', 'serve');--> statement-breakpoint
CREATE TYPE "brand_types" AS ENUM('brewery', 'distillery', 'kura', 'manufacturer', 'other', 'restaurant_chain', 'roastery', 'tea_house', 'winery');--> statement-breakpoint
CREATE TYPE "recipe_category" AS ENUM('cocktail', 'mocktail', 'other', 'punch', 'shot');--> statement-breakpoint
CREATE TYPE "coffee_roast_level" AS ENUM('DARK', 'EXTRA_DARK', 'LIGHT', 'LIGHT_MEDIUM', 'MEDIUM', 'MEDIUM_DARK');--> statement-breakpoint
CREATE TYPE "coffee_process" AS ENUM('HONEY', 'NATURAL_DRY', 'PULPED_NATURAL', 'PULPED_NATURAL_HONEY', 'WASHED', 'WET_HULLED');--> statement-breakpoint
CREATE TYPE "coffee_species" AS ENUM('ARABICA', 'CHARRIERIANA', 'LIBERICA', 'ROBUSTA', 'STENOPHYLLA');--> statement-breakpoint
CREATE TYPE "tea_caffeine_level" AS ENUM('decaf', 'high', 'low', 'medium', 'none');--> statement-breakpoint
CREATE TYPE "tea_form" AS ENUM('brick', 'instant', 'loose_leaf', 'matcha_powder', 'sachet', 'tea_bag');--> statement-breakpoint
CREATE TYPE "sake_serving_temperature" AS ENUM('atsu_kan', 'hitohada_kan', 'hiya', 'jo_kan', 'nuru_kan', 'rei_shu', 'room_temperature', 'tobikiri_kan', 'yuki_hie');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_budget_config" (
	"service" text,
	"monthly_budget_cents" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text DEFAULT '',
	"free_tier_monthly_requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_budget_config_pkey" PRIMARY KEY("service","endpoint")
);
--> statement-breakpoint
CREATE TABLE "api_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"service" text NOT NULL,
	"endpoint" text NOT NULL,
	"estimated_cost_cents" integer NOT NULL,
	"entity_id" uuid,
	"entity_type" text,
	"triggered_by" uuid,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barcodes" (
	"code" text PRIMARY KEY,
	"type" text
);
--> statement-breakpoint
CREATE TABLE "beer_style" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "beers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"alcohol_content_percentage" numeric,
	"international_bitterness_unit" integer,
	"description" text,
	"style" text,
	"vintage" date,
	"barcode_code" text,
	"country" text,
	"item_onboarding_id" uuid NOT NULL,
	CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric)))
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"brand_type" "brand_types",
	"parent_brand_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "category_vectors" (
	"id" serial PRIMARY KEY,
	"label" text NOT NULL CONSTRAINT "category_vectors_label_key" UNIQUE,
	"label_type" text DEFAULT 'category' NOT NULL,
	"associated_categories" text[] DEFAULT '{}'::text[],
	"vector" halfvec(768) NOT NULL,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "category_vectors_label_type_check" CHECK ((label_type = ANY (ARRAY['category'::text, 'alias'::text, 'item_type'::text, 'descriptor'::text])))
);
--> statement-breakpoint
CREATE TABLE "cellar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"cellar_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"wine_id" uuid,
	"beer_id" uuid,
	"spirit_id" uuid,
	"open_at" timestamp with time zone,
	"empty_at" timestamp with time zone,
	"display_image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"percentage_remaining" numeric DEFAULT '100' NOT NULL,
	"coffee_id" uuid,
	"source_type" text,
	"source_place_id" uuid,
	"source_menu_item_id" uuid,
	"sake_id" uuid,
	"tea_id" uuid,
	"type" text GENERATED ALWAYS AS (
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
    ELSE 'SPIRIT'::text
END) STORED,
	CONSTRAINT "cellar_items_source_type_check" CHECK ((source_type = ANY (ARRAY['manual'::text, 'menu_discovery'::text, 'menu_scan'::text, 'import'::text]))),
	CONSTRAINT "Ensure exactly one item Id" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)),
	CONSTRAINT "Percentage remaining between 0 and 100" CHECK (((percentage_remaining >= (0)::numeric) AND (percentage_remaining <= (100)::numeric)))
);
--> statement-breakpoint
CREATE TABLE "cellar_owners" (
	"user_id" uuid,
	"cellar_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cellar_owners_pkey" PRIMARY KEY("user_id","cellar_id")
);
--> statement-breakpoint
CREATE TABLE "cellars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"privacy" "permission_type" DEFAULT 'PRIVATE'::"permission_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"cellar_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coffee_cultivar" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "coffees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"description" text NOT NULL,
	"roast_level" "coffee_roast_level",
	"country" text,
	"process" "coffee_process",
	"barcode_code" text,
	"item_onboarding_id" uuid NOT NULL,
	"species" "coffee_species",
	"cultivar" text
);
--> statement-breakpoint
CREATE TABLE "country" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"bucket" text DEFAULT 'cellar-files' NOT NULL,
	"key" text NOT NULL,
	"size" integer,
	"mime_type" text,
	"etag" text,
	"uploaded_by" uuid,
	"verified_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"status" "friend_request_status" NOT NULL,
	CONSTRAINT "friend_requests_user_id_friend_id_key" UNIQUE("user_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"user_id" uuid,
	"friend_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friends_pkey" PRIMARY KEY("user_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "generic_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"item_type" text NOT NULL,
	"description" text,
	"is_substitutable" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_id" uuid,
	CONSTRAINT "idx_generic_items_name_category" UNIQUE("name","category"),
	CONSTRAINT "generic_items_item_type_check" CHECK ((item_type = ANY (ARRAY['spirit'::text, 'wine'::text, 'beer'::text, 'coffee'::text, 'ingredient'::text])))
);
--> statement-breakpoint
CREATE TABLE "item_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wine_id" uuid,
	"beer_id" uuid,
	"spirit_id" uuid,
	"coffee_id" uuid,
	"brand_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"sake_id" uuid,
	"tea_id" uuid,
	CONSTRAINT "exactly_one_item_reference" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1))
);
--> statement-breakpoint
CREATE TABLE "item_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"beer_id" uuid,
	"wine_id" uuid,
	"spirit_id" uuid,
	"coffee_id" uuid,
	"sake_id" uuid,
	"tea_id" uuid,
	"type" "item_type" GENERATED ALWAYS AS (
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::item_type
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::item_type
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::item_type
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::item_type
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::item_type
    ELSE 'SPIRIT'::item_type
END) STORED NOT NULL,
	CONSTRAINT "item_favorites_user_id_beer_id_key" UNIQUE("user_id","beer_id"),
	CONSTRAINT "item_favorites_user_id_coffee_id_key" UNIQUE("user_id","coffee_id"),
	CONSTRAINT "item_favorites_user_id_sake_id_key" UNIQUE("user_id","sake_id"),
	CONSTRAINT "item_favorites_user_id_spirit_id_key" UNIQUE("user_id","spirit_id"),
	CONSTRAINT "item_favorites_user_id_tea_id_key" UNIQUE("user_id","tea_id"),
	CONSTRAINT "item_favorites_user_id_wine_id_key" UNIQUE("user_id","wine_id"),
	CONSTRAINT "Ensure one item_id present" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1))
);
--> statement-breakpoint
CREATE TABLE "item_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"beer_id" uuid,
	"wine_id" uuid,
	"spirit_id" uuid,
	"is_public" boolean NOT NULL,
	"placeholder" text,
	"coffee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"sake_id" uuid,
	"tea_id" uuid,
	CONSTRAINT "Ensure at least one item Id" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1))
);
--> statement-breakpoint
CREATE TABLE "item_match_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"place_menu_item_id" uuid NOT NULL,
	"suggested_wine_id" uuid,
	"suggested_beer_id" uuid,
	"suggested_spirit_id" uuid,
	"suggested_coffee_id" uuid,
	"suggested_sake_id" uuid,
	"suggested_recipe_id" uuid,
	"confidence_score" numeric(3,2) NOT NULL,
	"match_reasoning" text,
	"similarity_metrics" jsonb,
	"accepted" boolean,
	"rejected" boolean,
	"acted_by" uuid,
	"acted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"suggested_tea_id" uuid,
	CONSTRAINT "check_single_suggested_item" CHECK ((num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id, suggested_sake_id, suggested_tea_id, suggested_recipe_id) = 1))
);
--> statement-breakpoint
CREATE TABLE "item_onboardings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'START' NOT NULL,
	"barcode" text,
	"barcode_type" text,
	"front_label_image_id" uuid,
	"back_label_image_id" uuid,
	"raw_defaults" text,
	"defaults" jsonb,
	"item_type" text NOT NULL,
	"ai_model" text,
	"confidence" double precision,
	"last_reprocess_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "item_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" real NOT NULL,
	"text" json,
	"beer_id" uuid,
	"wine_id" uuid,
	"spirit_id" uuid,
	"user_id" uuid NOT NULL,
	"coffee_id" uuid,
	"sake_id" uuid,
	"tea_id" uuid,
	CONSTRAINT "Ensure one item_id present" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)),
	CONSTRAINT "Score in allowed values" CHECK ((score = ANY (ARRAY[(0.5)::double precision, ((1)::numeric)::double precision, (1.5)::double precision, ((2)::numeric)::double precision, (2.5)::double precision, ((3)::numeric)::double precision, (3.5)::double precision, ((4)::numeric)::double precision, (4.5)::double precision, ((5)::numeric)::double precision])))
);
--> statement-breakpoint
CREATE TABLE "item_vectors" (
	"id" serial PRIMARY KEY,
	"beer_id" uuid,
	"wine_id" uuid,
	"spirit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"coffee_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now(),
	"vector" halfvec(768),
	"sake_id" uuid,
	"tea_id" uuid
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cursor" jsonb,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"total" integer,
	"processed" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" uuid PRIMARY KEY,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "menu_item_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"menu_item_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "menu_item_recipes_menu_item_id_recipe_id_key" UNIQUE("menu_item_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "menu_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"place_id" uuid,
	"original_image_id" uuid NOT NULL,
	"processed_image_id" uuid,
	"extracted_text" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"confidence_score" numeric(3,2),
	"scan_location" geography(Point,4326),
	"estimated_place_id" uuid,
	"manual_place_override" uuid,
	"processing_model" text,
	"processing_duration_ms" integer,
	"items_detected" integer DEFAULT 0,
	"items_matched" integer DEFAULT 0,
	"scanned_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "menu_scans_processing_status_check" CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"seq" bigserial,
	"target_actor" text NOT NULL,
	"target_id" text NOT NULL,
	"method" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'delivering'::text, 'delivered'::text, 'dead'::text])))
);
--> statement-breakpoint
CREATE TABLE "place_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"place_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "place_brands_place_id_brand_id_key" UNIQUE("place_id","brand_id"),
	CONSTRAINT "place_brands_relationship_type_check" CHECK ((relationship_type = ANY (ARRAY['owned_by'::text, 'affiliated_with'::text, 'serves'::text])))
);
--> statement-breakpoint
CREATE TABLE "place_google_enrichments" (
	"place_id" uuid PRIMARY KEY,
	"google_place_id" text NOT NULL,
	"google_name" text,
	"google_formatted_address" text,
	"google_rating" real,
	"google_user_ratings_total" integer,
	"google_price_level" integer,
	"google_website" text,
	"google_phone" text,
	"google_opening_hours" jsonb,
	"google_types" text[],
	"google_business_status" text,
	"google_editorial_summary" text,
	"photo_references" jsonb DEFAULT '[]',
	"attributions" jsonb DEFAULT '[]',
	"resolved_via" text NOT NULL,
	"details_fetched_at" timestamp with time zone,
	"photos_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_google_enrichments_resolved_via_check" CHECK ((resolved_via = ANY (ARRAY['nearby_search'::text, 'autocomplete'::text, 'text_search'::text])))
);
--> statement-breakpoint
CREATE TABLE "place_google_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"place_id" uuid NOT NULL,
	"google_photo_name" text NOT NULL,
	"storage_file_id" uuid,
	"width" integer,
	"height" integer,
	"attributions" jsonb DEFAULT '[]' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"place_menu_id" uuid,
	"menu_scan_id" uuid,
	"place_id" uuid NOT NULL,
	"menu_item_name" text NOT NULL,
	"menu_item_description" text,
	"menu_item_price" numeric(10,2),
	"menu_category" text,
	"detected_item_type" text,
	"confidence_score" numeric(3,2),
	"extracted_attributes" jsonb,
	"wine_id" uuid,
	"beer_id" uuid,
	"spirit_id" uuid,
	"coffee_id" uuid,
	"match_verified_by" uuid,
	"match_verified_at" timestamp with time zone,
	"is_available" boolean DEFAULT true,
	"seasonal" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "check_menu_or_scan_source" CHECK ((num_nonnulls(place_menu_id, menu_scan_id) = 1)),
	CONSTRAINT "check_single_item_type" CHECK ((num_nonnulls(wine_id, beer_id, spirit_id, coffee_id) <= 1)),
	CONSTRAINT "place_menu_items_detected_item_type_check" CHECK ((detected_item_type = ANY (ARRAY['wine'::text, 'beer'::text, 'spirit'::text, 'coffee'::text, 'unknown'::text])))
);
--> statement-breakpoint
CREATE TABLE "place_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"place_id" uuid NOT NULL,
	"menu_data" jsonb NOT NULL,
	"menu_type" text,
	"source" text NOT NULL,
	"source_url" text,
	"discovery_method" text,
	"confidence_score" numeric(3,2),
	"version" integer DEFAULT 1,
	"is_current" boolean DEFAULT true,
	"valid_from" timestamp with time zone DEFAULT now(),
	"valid_until" timestamp with time zone,
	"created_by" uuid,
	"verified_by" uuid,
	"discovered_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "place_menus_menu_type_check" CHECK ((menu_type = ANY (ARRAY['food'::text, 'drinks'::text, 'wine'::text, 'beer'::text, 'cocktails'::text, 'coffee'::text]))),
	CONSTRAINT "place_menus_source_check" CHECK ((source = ANY (ARRAY['web_scrape'::text, 'api'::text, 'user_upload'::text, 'ai_generated'::text, 'camera_scan'::text])))
);
--> statement-breakpoint
CREATE TABLE "place_vectors" (
	"id" serial PRIMARY KEY,
	"vector" halfvec(768) NOT NULL,
	"place_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"overture_id" text CONSTRAINT "places_overture_id_key" UNIQUE,
	"name" text NOT NULL,
	"display_name" text,
	"categories" text[] NOT NULL,
	"confidence" numeric(3,2),
	"location" geography(Point,4326) NOT NULL,
	"street_address" text,
	"locality" text,
	"region" text,
	"postcode" text,
	"country_code" char(2),
	"phone" text,
	"website" text,
	"email" text,
	"hours" jsonb,
	"price_level" integer,
	"rating" numeric(2,1),
	"review_count" integer DEFAULT 0,
	"access_count" integer DEFAULT 0,
	"last_accessed_at" timestamp with time zone,
	"first_cached_reason" text,
	"source_tags" jsonb,
	"is_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_sync_at" timestamp with time zone,
	"primary_category" text GENERATED ALWAYS AS (categories[1]) STORED,
	"search_text" tsvector,
	"created_by" uuid,
	"source" text DEFAULT 'overture' NOT NULL,
	"description" text,
	"google_place_id" text,
	CONSTRAINT "places_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
	CONSTRAINT "places_price_level_check" CHECK (((price_level >= 1) AND (price_level <= 4))),
	CONSTRAINT "places_rating_check" CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
	CONSTRAINT "places_source_check" CHECK ((source = ANY (ARRAY['overture'::text, 'user'::text, 'merged'::text])))
);
--> statement-breakpoint
CREATE TABLE "recipe_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"category" "recipe_category" NOT NULL,
	"base_spirit" text,
	"tags" text[],
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_id" uuid,
	"canonical_recipe_id" uuid,
	CONSTRAINT "recipe_groups_name_check" CHECK ((length(name) > 0))
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipe_id" uuid NOT NULL,
	"wine_id" uuid,
	"beer_id" uuid,
	"spirit_id" uuid,
	"coffee_id" uuid,
	"generic_item_id" uuid,
	"quantity" numeric,
	"unit" text,
	"is_optional" boolean DEFAULT false,
	"substitution_notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"sake_id" uuid,
	"tea_id" uuid,
	CONSTRAINT "exactly_one_item_reference" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id, generic_item_id) = 1))
);
--> statement-breakpoint
CREATE TABLE "recipe_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipe_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"instruction_text" text NOT NULL,
	"instruction_type" "instruction_types",
	"equipment_needed" text,
	"time_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recipe_instructions_recipe_id_step_number_key" UNIQUE("recipe_id","step_number")
);
--> statement-breakpoint
CREATE TABLE "recipe_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" real,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_reviews_unique_user_recipe" UNIQUE("recipe_id","user_id"),
	CONSTRAINT "recipe_reviews_score_range" CHECK (((score IS NULL) OR (score = ANY (ARRAY[(0.5)::double precision, ((1)::numeric)::double precision, (1.5)::double precision, ((2)::numeric)::double precision, (2.5)::double precision, ((3)::numeric)::double precision, (3.5)::double precision, ((4)::numeric)::double precision, (4.5)::double precision, ((5)::numeric)::double precision]))))
);
--> statement-breakpoint
CREATE TABLE "recipe_vectors" (
	"id" serial PRIMARY KEY,
	"vector" halfvec(768) NOT NULL,
	"recipe_id" uuid NOT NULL,
	"embedding_text" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vote_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recipe_votes_recipe_id_user_id_key" UNIQUE("recipe_id","user_id"),
	CONSTRAINT "recipe_votes_vote_type_check" CHECK ((vote_type = ANY (ARRAY['upvote'::text, 'downvote'::text])))
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"canonical_recipe_id" uuid,
	"difficulty_level" integer,
	"prep_time_minutes" integer,
	"serving_size" integer,
	"image_url" text,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"recipe_group_id" uuid,
	"created_by_id" uuid,
	CONSTRAINT "recipes_difficulty_level_check" CHECK (((difficulty_level >= 1) AND (difficulty_level <= 5))),
	CONSTRAINT "recipes_type_check" CHECK ((type = ANY (ARRAY['food'::text, 'cocktail'::text])))
);
--> statement-breakpoint
CREATE TABLE "sake_category" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "sake_rice_variety" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "sake_type" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "sakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"region" text,
	"category" text,
	"type" text,
	"polish_grade" numeric(4,2),
	"alcohol_content_percentage" numeric(4,2),
	"serving_temperature" "sake_serving_temperature",
	"rice_variety" text,
	"yeast_strain" text,
	"sake_meter_value" numeric(4,2),
	"acidity" numeric(4,2),
	"amino_acid" numeric(4,2),
	"vintage" integer,
	"country" text,
	"barcode_code" text,
	"item_onboarding_id" uuid
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spirit_type" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "spirits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"type" text NOT NULL,
	"vintage" date,
	"description" text,
	"alcohol_content_percentage" numeric,
	"style" text,
	"barcode_code" text,
	"country" text,
	"item_onboarding_id" uuid NOT NULL,
	CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric)))
);
--> statement-breakpoint
CREATE TABLE "tea_category" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "teas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"category" text,
	"form" "tea_form",
	"caffeine_level" "tea_caffeine_level",
	"region" text,
	"country" text,
	"cultivar" text,
	"oxidation_level" text,
	"processing" text,
	"harvest_year" integer,
	"ingredients" text,
	"steeping_temperature" text,
	"steeping_time" text,
	"flavor_profile" text,
	"is_organic" boolean,
	"is_fair_trade" boolean,
	"barcode_code" text,
	"item_onboarding_id" uuid
);
--> statement-breakpoint
CREATE TABLE "tier_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tier_list_id" uuid NOT NULL,
	"band" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"place_id" uuid,
	"wine_id" uuid,
	"beer_id" uuid,
	"spirit_id" uuid,
	"coffee_id" uuid,
	"sake_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"tea_id" uuid,
	"type" text GENERATED ALWAYS AS (
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
	CONSTRAINT "unique_beer_in_tier_list" UNIQUE("tier_list_id","beer_id"),
	CONSTRAINT "unique_coffee_in_tier_list" UNIQUE("tier_list_id","coffee_id"),
	CONSTRAINT "unique_place_in_tier_list" UNIQUE("tier_list_id","place_id"),
	CONSTRAINT "unique_sake_in_tier_list" UNIQUE("tier_list_id","sake_id"),
	CONSTRAINT "unique_spirit_in_tier_list" UNIQUE("tier_list_id","spirit_id"),
	CONSTRAINT "unique_tea_in_tier_list" UNIQUE("tier_list_id","tea_id"),
	CONSTRAINT "unique_wine_in_tier_list" UNIQUE("tier_list_id","wine_id"),
	CONSTRAINT "exactly_one_tier_item_reference" CHECK ((num_nonnulls(place_id, wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) = 1)),
	CONSTRAINT "tier_list_items_band_check" CHECK (((band >= 0) AND (band <= 5)))
);
--> statement-breakpoint
CREATE TABLE "tier_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"created_by_id" uuid NOT NULL,
	"privacy" "permission_type" DEFAULT 'PRIVATE'::"permission_type" NOT NULL,
	"list_type" text DEFAULT 'place' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_insights" jsonb,
	"insights_generated_at" timestamp with time zone,
	"is_editing_locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"locale" text,
	"disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_place_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"is_favorite" boolean DEFAULT false,
	"is_visited" boolean DEFAULT false,
	"want_to_visit" boolean DEFAULT false,
	"rating" integer,
	"notes" text,
	"tags" text[],
	"last_visited_at" timestamp with time zone,
	"visit_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unique_user_place" UNIQUE("user_id","place_id"),
	CONSTRAINT "user_place_interactions_rating_check" CHECK (((rating >= 1) AND (rating <= 5)))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wine_style" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "wine_variety" (
	"value" text PRIMARY KEY,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "wines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"vintage" date NOT NULL,
	"variety" text,
	"region" text,
	"winery_id" uuid,
	"description" text,
	"special_designation" text,
	"vineyard_designation" text,
	"alcohol_content_percentage" numeric,
	"barcode_code" text,
	"style" text NOT NULL,
	"country" text,
	"item_onboarding_id" uuid NOT NULL,
	CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_key" ON "account" ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_unique_lower_name" ON "brands" (lower(name));--> statement-breakpoint
CREATE INDEX "idx_brands_name" ON "brands" ("name");--> statement-breakpoint
CREATE INDEX "idx_brands_name_trgm" ON "brands" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_brands_parent" ON "brands" ("parent_brand_id");--> statement-breakpoint
CREATE INDEX "idx_brands_type" ON "brands" ("brand_type");--> statement-breakpoint
CREATE UNIQUE INDEX "files_bucket_key_idx" ON "files" ("bucket","key");--> statement-breakpoint
CREATE INDEX "files_unverified_idx" ON "files" ("created_at") WHERE (verified_at IS NULL);--> statement-breakpoint
CREATE INDEX "idx_api_usage_log_created_at" ON "api_usage_log" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_api_usage_log_service_created" ON "api_usage_log" ("service","created_at");--> statement-breakpoint
CREATE INDEX "idx_category_vectors_hnsw" ON "category_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_category_vectors_label_type" ON "category_vectors" ("label_type");--> statement-breakpoint
CREATE INDEX "idx_cellar_items_cellar_id" ON "cellar_items" ("cellar_id");--> statement-breakpoint
CREATE INDEX "idx_cellar_items_sake_id" ON "cellar_items" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_cellar_items_tea_id" ON "cellar_items" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_cellar_owners_cellar" ON "cellar_owners" ("cellar_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_cellars_created_by_id" ON "cellars" ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_cellars_privacy_public" ON "cellars" ("id") WHERE (privacy = 'PUBLIC'::permission_type);--> statement-breakpoint
CREATE INDEX "idx_friends_friend_user" ON "friends" ("friend_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_generic_items_category" ON "generic_items" ("category");--> statement-breakpoint
CREATE INDEX "idx_generic_items_created_by" ON "generic_items" ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_generic_items_item_type" ON "generic_items" ("item_type");--> statement-breakpoint
CREATE INDEX "idx_item_brands_beer_id" ON "item_brands" ("beer_id");--> statement-breakpoint
CREATE INDEX "idx_item_brands_brand_id" ON "item_brands" ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_item_brands_coffee_id" ON "item_brands" ("coffee_id");--> statement-breakpoint
CREATE INDEX "idx_item_brands_sake_id" ON "item_brands" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_item_brands_spirit_id" ON "item_brands" ("spirit_id");--> statement-breakpoint
CREATE INDEX "idx_item_brands_tea_id" ON "item_brands" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_item_brands_wine_id" ON "item_brands" ("wine_id");--> statement-breakpoint
CREATE INDEX "idx_item_favorites_sake_id" ON "item_favorites" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_item_favorites_tea_id" ON "item_favorites" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_item_image_sake_id" ON "item_image" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_item_image_tea_id" ON "item_image" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_item_match_suggestions_suggested_tea_id" ON "item_match_suggestions" ("suggested_tea_id");--> statement-breakpoint
CREATE INDEX "idx_match_suggestions_pending" ON "item_match_suggestions" ("place_menu_item_id") WHERE ((accepted IS NULL) AND (rejected IS NULL));--> statement-breakpoint
CREATE INDEX "idx_item_reviews_sake_id" ON "item_reviews" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_item_reviews_tea_id" ON "item_reviews" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_item_vectors_sake_id" ON "item_vectors" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_item_vectors_tea_id" ON "item_vectors" ("tea_id");--> statement-breakpoint
CREATE INDEX "item_vectors_vector_hnsw_idx" ON "item_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "item_vectors_vector_hnsw_l2_idx" ON "item_vectors" USING hnsw ("vector" halfvec_l2_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_menu_item_recipes_menu_item_id" ON "menu_item_recipes" ("menu_item_id");--> statement-breakpoint
CREATE INDEX "idx_menu_item_recipes_recipe_id" ON "menu_item_recipes" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_menu_scans_location" ON "menu_scans" USING gist ("scan_location");--> statement-breakpoint
CREATE INDEX "idx_menu_scans_status" ON "menu_scans" ("processing_status");--> statement-breakpoint
CREATE INDEX "idx_menu_scans_user" ON "menu_scans" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pge_details_fetched_at" ON "place_google_enrichments" ("details_fetched_at");--> statement-breakpoint
CREATE INDEX "idx_pge_google_place_id" ON "place_google_enrichments" ("google_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_google_place_id" ON "place_google_enrichments" ("google_place_id");--> statement-breakpoint
CREATE INDEX "idx_pgp_place_id" ON "place_google_photos" ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_place_photo" ON "place_google_photos" ("place_id","google_photo_name");--> statement-breakpoint
CREATE INDEX "idx_place_brands_brand_id" ON "place_brands" ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_place_brands_place_id" ON "place_brands" ("place_id");--> statement-breakpoint
CREATE INDEX "idx_place_menu_items_menu" ON "place_menu_items" ("place_menu_id");--> statement-breakpoint
CREATE INDEX "idx_place_menu_items_place" ON "place_menu_items" ("place_id");--> statement-breakpoint
CREATE INDEX "idx_place_menu_items_scan" ON "place_menu_items" ("menu_scan_id");--> statement-breakpoint
CREATE INDEX "idx_place_menu_items_type" ON "place_menu_items" ("detected_item_type");--> statement-breakpoint
CREATE INDEX "idx_place_menu_items_unmatched" ON "place_menu_items" ("wine_id","beer_id","spirit_id","coffee_id") WHERE ((wine_id IS NULL) AND (beer_id IS NULL) AND (spirit_id IS NULL) AND (coffee_id IS NULL));--> statement-breakpoint
CREATE INDEX "idx_place_menus_current" ON "place_menus" ("place_id","is_current") WHERE (is_current = true);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_place_menus_current_unique" ON "place_menus" ("place_id","menu_type") WHERE (is_current = true);--> statement-breakpoint
CREATE INDEX "idx_place_menus_place_id" ON "place_menus" ("place_id");--> statement-breakpoint
CREATE INDEX "idx_place_menus_type" ON "place_menus" ("menu_type");--> statement-breakpoint
CREATE INDEX "idx_place_vectors_hnsw" ON "place_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_place_vectors_hnsw_l2" ON "place_vectors" USING hnsw ("vector" halfvec_l2_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_place_vectors_place_created" ON "place_vectors" ("place_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_place_vectors_place_id" ON "place_vectors" ("place_id");--> statement-breakpoint
CREATE INDEX "idx_places_categories" ON "places" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "idx_places_created_by_created_at" ON "places" ("created_by","created_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_places_google_place_id" ON "places" ("google_place_id") WHERE (google_place_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_places_locality" ON "places" ("locality");--> statement-breakpoint
CREATE INDEX "idx_places_locality_trgm" ON "places" USING gin ("locality" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_places_location" ON "places" USING gist ("location");--> statement-breakpoint
CREATE INDEX "idx_places_name_compact_trgm" ON "places" USING gin (regexp_replace(lower(name), '[^a-z0-9]'::text, ''::text, 'g'::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_places_name_trgm" ON "places" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_places_primary_category" ON "places" ("primary_category");--> statement-breakpoint
CREATE INDEX "idx_places_search_text" ON "places" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX "places_created_by_idx" ON "places" ("created_by") WHERE (created_by IS NOT NULL);--> statement-breakpoint
CREATE INDEX "places_source_idx" ON "places" ("source");--> statement-breakpoint
CREATE INDEX "idx_recipe_groups_base_spirit" ON "recipe_groups" ("base_spirit");--> statement-breakpoint
CREATE INDEX "idx_recipe_groups_canonical_recipe" ON "recipe_groups" ("canonical_recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_groups_category" ON "recipe_groups" ("category");--> statement-breakpoint
CREATE INDEX "idx_recipe_groups_created_by" ON "recipe_groups" ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_groups_tags" ON "recipe_groups" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_beer_id" ON "recipe_ingredients" ("beer_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_coffee_id" ON "recipe_ingredients" ("coffee_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_generic_id" ON "recipe_ingredients" ("generic_item_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_recipe_id" ON "recipe_ingredients" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_sake_id" ON "recipe_ingredients" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_spirit_id" ON "recipe_ingredients" ("spirit_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_tea_id" ON "recipe_ingredients" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_wine_id" ON "recipe_ingredients" ("wine_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_instructions_recipe_id" ON "recipe_instructions" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_instructions_step" ON "recipe_instructions" ("recipe_id","step_number");--> statement-breakpoint
CREATE INDEX "idx_recipe_instructions_type" ON "recipe_instructions" ("instruction_type");--> statement-breakpoint
CREATE INDEX "idx_recipe_reviews_created_at" ON "recipe_reviews" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_recipe_reviews_recipe_id" ON "recipe_reviews" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_reviews_score" ON "recipe_reviews" ("score");--> statement-breakpoint
CREATE INDEX "idx_recipe_reviews_user_id" ON "recipe_reviews" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_vectors_hnsw_cosine" ON "recipe_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_recipe_vectors_hnsw_l2" ON "recipe_vectors" USING hnsw ("vector" halfvec_l2_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_recipe_vectors_recipe_id" ON "recipe_vectors" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_votes_recipe_id" ON "recipe_votes" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_votes_user_id" ON "recipe_votes" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_votes_vote_type" ON "recipe_votes" ("vote_type");--> statement-breakpoint
CREATE INDEX "idx_recipes_canonical" ON "recipes" ("canonical_recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_created_by" ON "recipes" ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_difficulty" ON "recipes" ("difficulty_level");--> statement-breakpoint
CREATE INDEX "idx_recipes_group_id" ON "recipes" ("recipe_group_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_name" ON "recipes" ("name");--> statement-breakpoint
CREATE INDEX "idx_recipes_type" ON "recipes" ("type");--> statement-breakpoint
CREATE INDEX "idx_sakes_category" ON "sakes" ("category");--> statement-breakpoint
CREATE INDEX "idx_sakes_created_by" ON "sakes" ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_sakes_name" ON "sakes" ("name");--> statement-breakpoint
CREATE INDEX "idx_sakes_polish_grade" ON "sakes" ("polish_grade");--> statement-breakpoint
CREATE INDEX "idx_sakes_region" ON "sakes" ("region");--> statement-breakpoint
CREATE INDEX "idx_sakes_type" ON "sakes" ("type");--> statement-breakpoint
CREATE INDEX "idx_sakes_vintage" ON "sakes" ("vintage");--> statement-breakpoint
CREATE INDEX "idx_teas_category" ON "teas" ("category");--> statement-breakpoint
CREATE INDEX "idx_teas_created_by" ON "teas" ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_teas_name" ON "teas" ("name");--> statement-breakpoint
CREATE INDEX "idx_teas_region" ON "teas" ("region");--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_beer_id" ON "tier_list_items" ("beer_id") WHERE (beer_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_coffee_id" ON "tier_list_items" ("coffee_id") WHERE (coffee_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_place_id_tier_list_id" ON "tier_list_items" ("place_id","tier_list_id");--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_sake_id" ON "tier_list_items" ("sake_id") WHERE (sake_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_spirit_id" ON "tier_list_items" ("spirit_id") WHERE (spirit_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_tea_id" ON "tier_list_items" ("tea_id") WHERE (tea_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tier_list_items_wine_id" ON "tier_list_items" ("wine_id") WHERE (wine_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "tier_list_items_place_id_idx" ON "tier_list_items" ("place_id");--> statement-breakpoint
CREATE INDEX "tier_list_items_tier_list_id_band_position_idx" ON "tier_list_items" ("tier_list_id","band" DESC,"position");--> statement-breakpoint
CREATE INDEX "tier_list_items_tier_list_id_idx" ON "tier_list_items" ("tier_list_id");--> statement-breakpoint
CREATE INDEX "idx_user_place_interactions_favorites" ON "user_place_interactions" ("user_id","is_favorite") WHERE (is_favorite = true);--> statement-breakpoint
CREATE INDEX "idx_user_place_interactions_place" ON "user_place_interactions" ("place_id");--> statement-breakpoint
CREATE INDEX "idx_user_place_interactions_user" ON "user_place_interactions" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_place_interactions_visited" ON "user_place_interactions" ("user_id","is_visited") WHERE (is_visited = true);--> statement-breakpoint
CREATE INDEX "idx_user_place_interactions_want_to_visit" ON "user_place_interactions" ("user_id","want_to_visit") WHERE (want_to_visit = true);--> statement-breakpoint
CREATE INDEX "jobs_kind_status_idx" ON "jobs" ("kind","status");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" ("run_after","seq") WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "tier_lists_created_by_id_idx" ON "tier_lists" ("created_by_id");--> statement-breakpoint
CREATE INDEX "tier_lists_privacy_idx" ON "tier_lists" ("privacy");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_key" ON "user" ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "place_vectors" ADD CONSTRAINT "place_vectors_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "recipe_vectors" ADD CONSTRAINT "recipe_vectors_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "item_vectors_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "item_vectors_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "item_vectors_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "item_vectors_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "item_vectors_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "item_vectors_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "user_place_interactions" ADD CONSTRAINT "user_place_interactions_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_place_interactions" ADD CONSTRAINT "user_place_interactions_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "beers" ADD CONSTRAINT "beers_barcode_code_barcodes_code_fkey" FOREIGN KEY ("barcode_code") REFERENCES "barcodes"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "beers" ADD CONSTRAINT "beers_country_country_value_fkey" FOREIGN KEY ("country") REFERENCES "country"("value");--> statement-breakpoint
ALTER TABLE "beers" ADD CONSTRAINT "beers_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "beers" ADD CONSTRAINT "beers_item_onboarding_id_item_onboardings_id_fkey" FOREIGN KEY ("item_onboarding_id") REFERENCES "item_onboardings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "beers" ADD CONSTRAINT "beers_style_beer_style_value_fkey" FOREIGN KEY ("style") REFERENCES "beer_style"("value");--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_parent_brand_id_brands_id_fkey" FOREIGN KEY ("parent_brand_id") REFERENCES "brands"("id");--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_cellar_id_cellars_id_fkey" FOREIGN KEY ("cellar_id") REFERENCES "cellars"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_display_image_id_item_image_id_fkey" FOREIGN KEY ("display_image_id") REFERENCES "item_image"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_source_menu_item_id_place_menu_items_id_fkey" FOREIGN KEY ("source_menu_item_id") REFERENCES "place_menu_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_source_place_id_places_id_fkey" FOREIGN KEY ("source_place_id") REFERENCES "places"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_owners" ADD CONSTRAINT "cellar_owners_cellar_id_cellars_id_fkey" FOREIGN KEY ("cellar_id") REFERENCES "cellars"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellar_owners" ADD CONSTRAINT "cellar_owners_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "cellars" ADD CONSTRAINT "cellars_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_cellar_item_id_cellar_items_id_fkey" FOREIGN KEY ("cellar_item_id") REFERENCES "cellar_items"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_barcode_code_barcodes_code_fkey" FOREIGN KEY ("barcode_code") REFERENCES "barcodes"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_country_country_value_fkey" FOREIGN KEY ("country") REFERENCES "country"("value");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_cultivar_coffee_cultivar_value_fkey" FOREIGN KEY ("cultivar") REFERENCES "coffee_cultivar"("value");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_item_onboarding_id_item_onboardings_id_fkey" FOREIGN KEY ("item_onboarding_id") REFERENCES "item_onboardings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_friend_id_user_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_user_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "generic_items" ADD CONSTRAINT "generic_items_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id");--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_brand_id_brands_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id");--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id");--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id");--> statement-breakpoint
ALTER TABLE "spirits" ADD CONSTRAINT "spirits_barcode_code_barcodes_code_fkey" FOREIGN KEY ("barcode_code") REFERENCES "barcodes"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "spirits" ADD CONSTRAINT "spirits_country_country_value_fkey" FOREIGN KEY ("country") REFERENCES "country"("value");--> statement-breakpoint
ALTER TABLE "spirits" ADD CONSTRAINT "spirits_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "spirits" ADD CONSTRAINT "spirits_item_onboarding_id_item_onboardings_id_fkey" FOREIGN KEY ("item_onboarding_id") REFERENCES "item_onboardings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "spirits" ADD CONSTRAINT "spirits_type_spirit_type_value_fkey" FOREIGN KEY ("type") REFERENCES "spirit_type"("value");--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "wines_barcode_code_barcodes_code_fkey" FOREIGN KEY ("barcode_code") REFERENCES "barcodes"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "wines_country_country_value_fkey" FOREIGN KEY ("country") REFERENCES "country"("value");--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "wines_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "wines_item_onboarding_id_item_onboardings_id_fkey" FOREIGN KEY ("item_onboarding_id") REFERENCES "item_onboardings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "wines_style_wine_style_value_fkey" FOREIGN KEY ("style") REFERENCES "wine_style"("value");--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "wines_variety_wine_variety_value_fkey" FOREIGN KEY ("variety") REFERENCES "wine_variety"("value");--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_file_id_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_acted_by_user_id_fkey" FOREIGN KEY ("acted_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_iENvq4dzHuvQ_fkey" FOREIGN KEY ("place_menu_item_id") REFERENCES "place_menu_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_beer_id_beers_id_fkey" FOREIGN KEY ("suggested_beer_id") REFERENCES "beers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_coffee_id_coffees_id_fkey" FOREIGN KEY ("suggested_coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_recipe_id_recipes_id_fkey" FOREIGN KEY ("suggested_recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_sake_id_sakes_id_fkey" FOREIGN KEY ("suggested_sake_id") REFERENCES "sakes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_spirit_id_spirits_id_fkey" FOREIGN KEY ("suggested_spirit_id") REFERENCES "spirits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_tea_id_teas_id_fkey" FOREIGN KEY ("suggested_tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "item_match_suggestions" ADD CONSTRAINT "item_match_suggestions_suggested_wine_id_wines_id_fkey" FOREIGN KEY ("suggested_wine_id") REFERENCES "wines"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD CONSTRAINT "item_onboardings_back_label_image_id_files_id_fkey" FOREIGN KEY ("back_label_image_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD CONSTRAINT "item_onboardings_front_label_image_id_files_id_fkey" FOREIGN KEY ("front_label_image_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD CONSTRAINT "item_onboardings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_reviews" ADD CONSTRAINT "item_reviews_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "menu_item_recipes" ADD CONSTRAINT "menu_item_recipes_menu_item_id_place_menu_items_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "place_menu_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "menu_item_recipes" ADD CONSTRAINT "menu_item_recipes_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "menu_scans" ADD CONSTRAINT "menu_scans_estimated_place_id_places_id_fkey" FOREIGN KEY ("estimated_place_id") REFERENCES "places"("id");--> statement-breakpoint
ALTER TABLE "menu_scans" ADD CONSTRAINT "menu_scans_manual_place_override_places_id_fkey" FOREIGN KEY ("manual_place_override") REFERENCES "places"("id");--> statement-breakpoint
ALTER TABLE "menu_scans" ADD CONSTRAINT "menu_scans_original_image_id_files_id_fkey" FOREIGN KEY ("original_image_id") REFERENCES "files"("id");--> statement-breakpoint
ALTER TABLE "menu_scans" ADD CONSTRAINT "menu_scans_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "menu_scans" ADD CONSTRAINT "menu_scans_processed_image_id_files_id_fkey" FOREIGN KEY ("processed_image_id") REFERENCES "files"("id");--> statement-breakpoint
ALTER TABLE "menu_scans" ADD CONSTRAINT "menu_scans_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_brands" ADD CONSTRAINT "place_brands_brand_id_brands_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_brands" ADD CONSTRAINT "place_brands_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_google_enrichments" ADD CONSTRAINT "place_google_enrichments_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_google_photos" ADD CONSTRAINT "place_google_photos_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_google_photos" ADD CONSTRAINT "place_google_photos_storage_file_id_files_id_fkey" FOREIGN KEY ("storage_file_id") REFERENCES "files"("id");--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_match_verified_by_user_id_fkey" FOREIGN KEY ("match_verified_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_menu_scan_id_menu_scans_id_fkey" FOREIGN KEY ("menu_scan_id") REFERENCES "menu_scans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_place_menu_id_place_menus_id_fkey" FOREIGN KEY ("place_menu_id") REFERENCES "place_menus"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "place_menus" ADD CONSTRAINT "place_menus_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "place_menus" ADD CONSTRAINT "place_menus_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_menus" ADD CONSTRAINT "place_menus_verified_by_user_id_fkey" FOREIGN KEY ("verified_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "recipe_groups" ADD CONSTRAINT "recipe_groups_canonical_recipe_id_recipes_id_fkey" FOREIGN KEY ("canonical_recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recipe_groups" ADD CONSTRAINT "recipe_groups_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_generic_item_id_generic_items_id_fkey" FOREIGN KEY ("generic_item_id") REFERENCES "generic_items"("id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id");--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD CONSTRAINT "recipe_instructions_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_reviews" ADD CONSTRAINT "recipe_reviews_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "recipe_reviews" ADD CONSTRAINT "recipe_reviews_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_canonical_recipe_id_recipes_id_fkey" FOREIGN KEY ("canonical_recipe_id") REFERENCES "recipes"("id");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_recipe_group_id_recipe_groups_id_fkey" FOREIGN KEY ("recipe_group_id") REFERENCES "recipe_groups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recipe_votes" ADD CONSTRAINT "recipe_votes_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_votes" ADD CONSTRAINT "recipe_votes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sakes" ADD CONSTRAINT "sakes_barcode_code_barcodes_code_fkey" FOREIGN KEY ("barcode_code") REFERENCES "barcodes"("code");--> statement-breakpoint
ALTER TABLE "sakes" ADD CONSTRAINT "sakes_category_sake_category_value_fkey" FOREIGN KEY ("category") REFERENCES "sake_category"("value");--> statement-breakpoint
ALTER TABLE "sakes" ADD CONSTRAINT "sakes_country_country_value_fkey" FOREIGN KEY ("country") REFERENCES "country"("value");--> statement-breakpoint
ALTER TABLE "sakes" ADD CONSTRAINT "sakes_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sakes" ADD CONSTRAINT "sakes_rice_variety_sake_rice_variety_value_fkey" FOREIGN KEY ("rice_variety") REFERENCES "sake_rice_variety"("value");--> statement-breakpoint
ALTER TABLE "sakes" ADD CONSTRAINT "sakes_type_sake_type_value_fkey" FOREIGN KEY ("type") REFERENCES "sake_type"("value");--> statement-breakpoint
ALTER TABLE "teas" ADD CONSTRAINT "teas_barcode_code_barcodes_code_fkey" FOREIGN KEY ("barcode_code") REFERENCES "barcodes"("code");--> statement-breakpoint
ALTER TABLE "teas" ADD CONSTRAINT "teas_category_tea_category_value_fkey" FOREIGN KEY ("category") REFERENCES "tea_category"("value");--> statement-breakpoint
ALTER TABLE "teas" ADD CONSTRAINT "teas_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id");--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_tier_list_id_tier_lists_id_fkey" FOREIGN KEY ("tier_list_id") REFERENCES "tier_lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id");--> statement-breakpoint
ALTER TABLE "tier_lists" ADD CONSTRAINT "tier_lists_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
*/