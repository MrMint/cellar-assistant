ALTER TABLE "user" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
CREATE INDEX "user_avatar_file_id_idx" ON "user" ("avatar_file_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_avatar_file_id_files_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE RESTRICT;