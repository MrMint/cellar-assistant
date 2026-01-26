-- Drop unused image_analysis tables
-- These tables were created for text extraction but are no longer used

-- Drop image_analysis_text_blocks first due to FK dependency on image_analysis
DROP TABLE IF EXISTS public.image_analysis_text_blocks CASCADE;

-- Drop image_analysis table
DROP TABLE IF EXISTS public.image_analysis CASCADE;
