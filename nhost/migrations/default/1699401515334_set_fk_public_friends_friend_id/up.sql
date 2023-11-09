alter table "public"."friends"
  add constraint "friends_friend_id_fkey"
  foreign key ("friend_id")
  references "auth"."users"
  ("id") on update restrict on delete restrict;
