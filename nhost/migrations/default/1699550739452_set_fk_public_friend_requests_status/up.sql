alter table "public"."friend_requests"
  add constraint "friend_requests_status_fkey"
  foreign key ("status")
  references "public"."friend_request_status"
  ("text") on update restrict on delete restrict;
