alter table "public"."cellar_items" add constraint "Percentage remaining between 0 and 100" check (percentage_remaining >= 0::numeric AND percentage_remaining <= 100::numeric);
