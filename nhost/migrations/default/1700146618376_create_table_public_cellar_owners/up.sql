CREATE TABLE "public"."cellar_owners" ("user_id" uuid NOT NULL, "cellar_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("user_id","cellar_id") , FOREIGN KEY ("cellar_id") REFERENCES "public"."cellars"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict);COMMENT ON TABLE "public"."cellar_owners" IS E'A cellars co-owners';
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
CREATE TRIGGER "set_public_cellar_owners_updated_at"
BEFORE UPDATE ON "public"."cellar_owners"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_cellar_owners_updated_at" ON "public"."cellar_owners"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
