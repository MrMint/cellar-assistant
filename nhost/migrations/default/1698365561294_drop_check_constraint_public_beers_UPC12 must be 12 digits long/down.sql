alter table "public"."beers" add constraint "UPC12 must be 12 digits long" check (CHECK (char_length(upc_12::text) = 12));
