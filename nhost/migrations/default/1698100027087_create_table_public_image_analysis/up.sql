CREATE TABLE "public"."image_analysis" ("id" serial NOT NULL, "file_id" uuid NOT NULL, "text_extraction_status" text NOT NULL DEFAULT 'QUEUED', "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("id") , FOREIGN KEY ("file_id") REFERENCES "storage"."files"("id") ON UPDATE restrict ON DELETE restrict);
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
CREATE TRIGGER "set_public_image_analysis_updated_at"
BEFORE UPDATE ON "public"."image_analysis"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_image_analysis_updated_at" ON "public"."image_analysis"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
