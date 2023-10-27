CREATE TABLE "public"."item_onboardings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "status" text NOT NULL DEFAULT 'START', "barcode" text, "barcode_type" text, "front_label_image_id" uuid, "back_label_image_id" uuid, "raw_defaults" text, "defaults" jsonb, "item_type" text NOT NULL, PRIMARY KEY ("id") , FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("front_label_image_id") REFERENCES "storage"."files"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("back_label_image_id") REFERENCES "storage"."files"("id") ON UPDATE restrict ON DELETE restrict);
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
CREATE TRIGGER "set_public_item_onboardings_updated_at"
BEFORE UPDATE ON "public"."item_onboardings"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_item_onboardings_updated_at" ON "public"."item_onboardings"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
