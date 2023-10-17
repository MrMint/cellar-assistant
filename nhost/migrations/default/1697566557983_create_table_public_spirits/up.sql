CREATE TABLE "public"."spirits" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "created_by_id" uuid NOT NULL, "cellar_id" uuid NOT NULL, "type" text NOT NULL, "vintage" date, "description" text, "ean_13" bigint, "upc_12" bigint, "price" money, "alcohol_content_percentage" numeric, "style" text, PRIMARY KEY ("id") , FOREIGN KEY ("created_by_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("cellar_id") REFERENCES "public"."cellars"("id") ON UPDATE restrict ON DELETE restrict, CONSTRAINT "Alcohol content percentage greater than 0 and less than 100" CHECK (alcohol_content_percentage >= 0::numeric AND alcohol_content_percentage <= 100::numeric), CONSTRAINT "UPC12 must be 12 digits long" CHECK (char_length(upc_12::text) = 12), CONSTRAINT "EAN13 must be 13 digits long" CHECK (char_length(ean_13::text) = 13));
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
CREATE TRIGGER "set_public_spirits_updated_at"
BEFORE UPDATE ON "public"."spirits"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_spirits_updated_at" ON "public"."spirits"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
