alter table "public"."cellar_items" drop constraint "Ensure exactly one item Id";
alter table "public"."cellar_items" add constraint "Ensure exactly one item Id" check (CHECK (num_nonnulls(beer_id, wine_id, spirit_id) = 1));
