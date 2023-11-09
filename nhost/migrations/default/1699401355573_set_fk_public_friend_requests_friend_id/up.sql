alter table "public"."friend_requests"
  add constraint "friend_requests_friend_id_fkey"
  foreign key ("friend_id")
  references "auth"."users"
  ("id") on update restrict on delete restrict;
