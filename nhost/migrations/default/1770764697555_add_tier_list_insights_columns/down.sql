DROP TRIGGER IF EXISTS tier_list_items_content_changed ON public.tier_list_items;
DROP FUNCTION IF EXISTS public.update_tier_list_content_timestamp();
ALTER TABLE public.tier_lists
  DROP COLUMN IF EXISTS content_updated_at,
  DROP COLUMN IF EXISTS ai_insights,
  DROP COLUMN IF EXISTS insights_generated_at;
