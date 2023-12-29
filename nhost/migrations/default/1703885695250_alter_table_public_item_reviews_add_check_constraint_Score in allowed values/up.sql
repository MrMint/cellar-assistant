alter table "public"."item_reviews" add constraint "Score in allowed values" check (score = ANY(ARRAY[.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]));
