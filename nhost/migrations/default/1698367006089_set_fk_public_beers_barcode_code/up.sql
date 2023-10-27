alter table "public"."beers"
  add constraint "beers_barcode_code_fkey"
  foreign key ("barcode_code")
  references "public"."barcodes"
  ("code") on update restrict on delete restrict;
