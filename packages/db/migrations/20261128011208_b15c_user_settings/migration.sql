CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY,
	"default_cellar_privacy" "permission_type" DEFAULT 'PRIVATE'::"permission_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT;