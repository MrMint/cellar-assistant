alter table "public"."wines" add constraint "UPC12 must be 12 digits long" check (char_length(upc_12::text) = 12);
