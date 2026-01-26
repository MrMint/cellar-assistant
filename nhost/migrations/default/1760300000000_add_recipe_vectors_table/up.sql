-- Create recipe_vectors table for semantic search functionality
-- Following the pattern established in item_vectors and place_vectors tables

CREATE TABLE "public"."recipe_vectors" (
  "id" serial NOT NULL,
  "vector" halfvec(768) NOT NULL,
  "recipe_id" uuid NOT NULL,
  "embedding_text" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON UPDATE restrict ON DELETE cascade
);

-- Recipe ID lookup index
CREATE INDEX "idx_recipe_vectors_recipe_id" ON "public"."recipe_vectors" ("recipe_id");

-- Create HNSW indexes for efficient similarity search
CREATE INDEX "idx_recipe_vectors_hnsw_cosine" ON "public"."recipe_vectors"
USING hnsw ("vector" halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX "idx_recipe_vectors_hnsw_l2" ON "public"."recipe_vectors"
USING hnsw ("vector" halfvec_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Create trigger for updated_at column
CREATE OR REPLACE FUNCTION update_recipe_vectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recipe_vectors_updated_at
    BEFORE UPDATE ON "public"."recipe_vectors"
    FOR EACH ROW EXECUTE FUNCTION update_recipe_vectors_updated_at();

-- Create computed field function for distance calculation
CREATE OR REPLACE FUNCTION public.calculate_recipe_vector_distance(
  recipe_vector recipe_vectors,
  query_vector halfvec(768)
)
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT recipe_vector.vector <=> query_vector
$function$;

-- Grant permissions to Hasura user
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."recipe_vectors" TO nhost_hasura;
GRANT USAGE, SELECT ON SEQUENCE "public"."recipe_vectors_id_seq" TO nhost_hasura;
GRANT EXECUTE ON FUNCTION public.calculate_recipe_vector_distance TO nhost_hasura;

-- Table and column comments
COMMENT ON TABLE "public"."recipe_vectors" IS 'Stores halfvec(768) embeddings for recipes with HNSW indexing for efficient semantic search';
COMMENT ON COLUMN "public"."recipe_vectors"."vector" IS 'halfvec(768) embedding with HNSW index support';
COMMENT ON COLUMN "public"."recipe_vectors"."embedding_text" IS 'The text used to generate the embedding, for debugging and regeneration';
