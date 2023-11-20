CREATE TABLE "public"."coffee" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "created_by_id" uuid NOT NULL, "description" text NOT NULL, "roast_level" text, "country" text, "process" text, "barcode_code" text, "item_onboarding_id" uuid NOT NULL, "species" text, "cultivar" text, PRIMARY KEY ("id") , FOREIGN KEY ("barcode_code") REFERENCES "public"."barcodes"("code") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("country") REFERENCES "public"."country"("text") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("created_by_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("item_onboarding_id") REFERENCES "public"."item_onboardings"("id") ON UPDATE restrict ON DELETE restrict);
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
CREATE TRIGGER "set_public_coffee_updated_at"
BEFORE UPDATE ON "public"."coffee"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_coffee_updated_at" ON "public"."coffee"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
