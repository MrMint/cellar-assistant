CREATE TABLE "public"."cellar_beer" ("id" uuid NOT NULL, "cellar_id" uuid NOT NULL, "beer_id" uuid NOT NULL, "user_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("id") , FOREIGN KEY ("cellar_id") REFERENCES "public"."cellars"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("beer_id") REFERENCES "public"."beers"("id") ON UPDATE restrict ON DELETE restrict, FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE restrict);
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
CREATE TRIGGER "set_public_cellar_beer_updated_at"
BEFORE UPDATE ON "public"."cellar_beer"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_public_cellar_beer_updated_at" ON "public"."cellar_beer"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
