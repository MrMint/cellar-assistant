alter table "public"."wines" add constraint "Alcohol content percentage greater than 0 and less than 100" check (alcohol_content_percentage >= 0 AND alcohol_content_percentage <= 100);
