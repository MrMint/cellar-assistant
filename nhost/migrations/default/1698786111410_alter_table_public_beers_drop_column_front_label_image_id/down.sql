alter table "public"."beers" alter column "front_label_image_id" drop not null;
alter table "public"."beers" add column "front_label_image_id" uuid;
