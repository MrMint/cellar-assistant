-- Create place_vectors table for semantic search functionality
-- Following the pattern established in item_vectors table

CREATE TABLE "public"."place_vectors" (
  "id" serial NOT NULL, 
  "vector" vector(3072) NOT NULL, 
  "place_id" uuid NOT NULL, 
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON UPDATE restrict ON DELETE cascade
);

-- Create indexes for performance
-- Note: Vector index creation skipped due to pgvector 2000 dimension limit
-- For 3072-dimensional vectors, we'll rely on sequential scans until pgvector is upgraded
-- TODO: Add vector index when pgvector supports >2000 dimensions

-- Place ID lookup index
CREATE INDEX "idx_place_vectors_place_id" ON "public"."place_vectors" ("place_id");

-- Composite index for better query performance
CREATE INDEX "idx_place_vectors_place_created" ON "public"."place_vectors" ("place_id", "created_at");

-- Create trigger function for updated_at column
CREATE OR REPLACE FUNCTION update_place_vectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at column
CREATE TRIGGER update_place_vectors_updated_at 
    BEFORE UPDATE ON "public"."place_vectors" 
    FOR EACH ROW EXECUTE FUNCTION update_place_vectors_updated_at();

-- Create computed field function for distance calculation (following item_vectors pattern)
CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search vector(3072))
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT place_vector.vector <=> search
$function$;

-- Grant permissions to Hasura user
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."place_vectors" TO nhost_hasura;
GRANT USAGE, SELECT ON SEQUENCE "public"."place_vectors_id_seq" TO nhost_hasura;
GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura;