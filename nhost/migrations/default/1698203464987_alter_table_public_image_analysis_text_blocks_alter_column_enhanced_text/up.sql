ALTER TABLE "public"."image_analysis_text_blocks" ALTER COLUMN "enhanced_text" drop default;
alter table "public"."image_analysis_text_blocks" alter column "enhanced_text" set not null;
