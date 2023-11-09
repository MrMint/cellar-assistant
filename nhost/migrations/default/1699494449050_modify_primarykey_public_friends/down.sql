alter table "public"."friends" drop constraint "friends_pkey";
alter table "public"."friends"
    add constraint "friends_pkey"
    primary key ("friend_id", "user_id");
