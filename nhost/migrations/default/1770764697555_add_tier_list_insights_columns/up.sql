ALTER TABLE public.tier_lists
  ADD COLUMN content_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN ai_insights JSONB DEFAULT NULL,
  ADD COLUMN insights_generated_at TIMESTAMPTZ DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.update_tier_list_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tier_lists
  SET content_updated_at = NOW()
  WHERE id = COALESCE(NEW.tier_list_id, OLD.tier_list_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tier_list_items_content_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.tier_list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tier_list_content_timestamp();
