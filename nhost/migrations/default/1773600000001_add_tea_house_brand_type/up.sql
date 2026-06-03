-- Add tea_house brand type for tea producers/estates/merchants (parity with sake's kura)
INSERT INTO brand_types (id, comment)
VALUES ('tea_house', 'Tea producers, estates and merchants')
ON CONFLICT (id) DO NOTHING;
