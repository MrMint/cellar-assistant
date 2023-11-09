alter table "public"."friend_requests"
  add constraint "friend_requests_user_id_fkey"
  foreign key ("user_id")
  references "auth"."users"
  ("id") on update restrict on delete restrict;
