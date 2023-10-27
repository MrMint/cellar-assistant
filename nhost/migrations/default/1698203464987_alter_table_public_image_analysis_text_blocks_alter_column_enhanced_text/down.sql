alter table "public"."image_analysis_text_blocks" alter column "enhanced_text" drop not null;
alter table "public"."image_analysis_text_blocks" alter column "enhanced_text" set default 'text'::text;
