alter table "public"."beers" alter column "back_label_image_id" drop not null;
alter table "public"."beers" add column "back_label_image_id" uuid;
