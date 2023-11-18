CREATE TABLE "public"."cellar_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "cellar_id" uuid NOT NULL, "created_by" uuid NOT NULL, "wine_id" uuid, "beer_id" uuid, "spirit_id" uuid, "open_at" timestamp, "empty_at" timestamptz, "display_image_id" uuid, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("id") , FOREIGN KEY ("cellar_id") REFERENCES "public"."cellars"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("wine_id") REFERENCES "public"."wines"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("beer_id") REFERENCES "public"."beers"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("spirit_id") REFERENCES "public"."spirits"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("display_image_id") REFERENCES "public"."item_image"("id") ON UPDATE restrict ON DELETE restrict, CONSTRAINT "Ensure exactly one item Id" CHECK (num_nonnulls(beer_id, wine_id, spirit_id) = 1));
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
CREATE TRIGGER "set_public_cellar_items_updated_at"
BEFORE UPDATE ON "public"."cellar_items"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_cellar_items_updated_at" ON "public"."cellar_items"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
