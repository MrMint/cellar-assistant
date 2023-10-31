alter table "public"."beers"
  add constraint "beers_item_onboarding_id_fkey"
  foreign key ("item_onboarding_id")
  references "public"."item_onboardings"
  ("id") on update restrict on delete restrict;
