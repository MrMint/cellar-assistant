alter table "public"."item_reviews" drop constraint "Ensure one item_id present";
alter table "public"."item_reviews" add constraint "Ensure one item_id present" check (CHECK (num_nonnulls(beer_id, wine_id, spirit_id) = 1));
