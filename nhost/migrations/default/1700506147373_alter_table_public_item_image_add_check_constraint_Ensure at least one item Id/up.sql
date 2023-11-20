alter table "public"."item_image" drop constraint "Ensure at least one item Id";
alter table "public"."item_image" add constraint "Ensure at least one item Id" check (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1);
