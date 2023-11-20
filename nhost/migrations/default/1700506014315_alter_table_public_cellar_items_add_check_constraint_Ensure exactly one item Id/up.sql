alter table "public"."cellar_items" drop constraint "Ensure exactly one item Id";
alter table "public"."cellar_items" add constraint "Ensure exactly one item Id" check (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1);
