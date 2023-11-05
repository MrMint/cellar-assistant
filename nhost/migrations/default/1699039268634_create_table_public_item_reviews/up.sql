CREATE TABLE "public"."item_reviews" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "score" numeric NOT NULL, "text" json NOT NULL, "beer_id" uuid, "wine_id" uuid, "spirit_id" uuid, "user_id" uuid NOT NULL, PRIMARY KEY ("id") , FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("beer_id") REFERENCES "public"."beers"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("wine_id") REFERENCES "public"."wines"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("spirit_id") REFERENCES "public"."spirits"("id") ON UPDATE restrict ON DELETE restrict, CONSTRAINT "Ensure one item_id present" CHECK (num_nonnulls(beer_id, wine_id, spirit_id) = 1));
CREATE OR REPLACE FUNCTION "public"."set_current_timestamp_updated_at"()
RETURNS TRIGGER AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "set_public_item_reviews_updated_at"
BEFORE UPDATE ON "public"."item_reviews"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_item_reviews_updated_at" ON "public"."item_reviews"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
