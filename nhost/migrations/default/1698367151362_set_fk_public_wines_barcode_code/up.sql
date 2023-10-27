alter table "public"."wines"
  add constraint "wines_barcode_code_fkey"
  foreign key ("barcode_code")
  references "public"."barcodes"
  ("code") on update restrict on delete restrict;
