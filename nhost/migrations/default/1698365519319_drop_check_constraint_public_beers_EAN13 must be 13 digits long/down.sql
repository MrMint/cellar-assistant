alter table "public"."beers" add constraint "EAN13 must be 13 digits long" check (CHECK (char_length(ean_13::text) = 13));
