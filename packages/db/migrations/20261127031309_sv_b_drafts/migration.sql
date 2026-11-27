ALTER TABLE "item_onboardings" ADD COLUMN "cellar_id" uuid;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD COLUMN "confirmed_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD COLUMN "vintage_answer" text DEFAULT 'UNANSWERED' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD COLUMN "display_maker" text;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD COLUMN "draft_fields" jsonb;--> statement-breakpoint
CREATE INDEX "idx_item_onboardings_needs_details" ON "item_onboardings" ("user_id","cellar_id") WHERE (status = 'NEEDS_DETAILS'::text);--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD CONSTRAINT "item_onboardings_cellar_id_cellars_id_fkey" FOREIGN KEY ("cellar_id") REFERENCES "cellars"("id") ON DELETE SET NULL ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD CONSTRAINT "item_onboardings_image_id_files_id_fkey" FOREIGN KEY ("image_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "item_onboardings" ADD CONSTRAINT "item_onboardings_vintage_answer_check" CHECK ((vintage_answer = ANY (ARRAY['VINTAGE'::text, 'NON_VINTAGE'::text, 'UNANSWERED'::text])));