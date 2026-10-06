-- One spelling per barcode: every stored code rewritten to its canonical form,
-- and codes that collapse onto one canonical form merged into one row.
--
-- `BarcodeActor` was keyed by the raw code, so UPC-A `012345678905` and EAN-13
-- `0012345678905` (one GTIN) were two activations and two `barcodes` rows, and
-- so were `abc123` and `ABC123` (docs/architecture/actor-keys.md). The rules
-- are `canonicalBarcodeCode` in packages/contracts/src/barcodes.ts — GTIN-14
-- for any 8/12/13/14-digit code with a valid GS1 check digit (8 digits read as
-- UPC-E or EAN-8 by check digit, the stored `type` breaking a tie), opaque for
-- any other all-digit code, ASCII-trim plus ASCII-upper-case for text.
-- `public.canonical_barcode_code(raw, symbology)` below is its SQL mirror;
-- services/actors/src/lib/barcode-canonical-sql.test.ts holds the two to the
-- same answers, and the next migration's `barcodes_code_canonical` CHECK uses
-- it to refuse a non-canonical code for good.
--
-- The data steps, all idempotent (a second run finds nothing to do):
--
--   1. NOTICE what is about to happen (db:migrate prints it).
--   2. Insert each canonical code that does not exist yet, and settle the
--      merged row's `type`: of the codes collapsing onto it, the first
--      non-null `type` taking the most-linked code first, then the code that
--      was already canonical, then byte order — deterministic, and the one
--      that already describes the most items.
--   3. Repoint the six `<item>.barcode_code` foreign keys (all ON UPDATE
--      RESTRICT/NO ACTION, which is why the codes are not renamed in place).
--   4. Rewrite undelivered outbox payloads that carry a code:
--      `ItemActor.setBarcode`'s `code` and `ItemActor.create`'s `barcodeCode`.
--      (`ItemActor` canonicalises both on delivery too; this keeps the stored
--      intent truthful.) Delivered rows are history and are left alone.
--   5. Delete the old spellings. They are unreferenced by now, and the
--      RESTRICT foreign keys make this fail loudly rather than orphan an item
--      if some reference was missed.
--
-- Not rewritten: `item_onboardings.barcode` — it is the record of what was
-- scanned, beside the `barcode_type` that disambiguates an 8-digit code, and
-- `ItemOnboardingActor.confirm` canonicalises it (with that type) when it
-- registers the barcode.
--
-- Nothing is dropped: a code that cannot be canonicalised (bad check digit,
-- no GTIN length, blank, OCR spill like `ANNO\n1822`) is its own canonical
-- form and stays exactly as stored.
--
-- Rewritten item rows' `updated_at` moves to now() (the BEFORE UPDATE trigger).
--
-- Measured before writing this (read-only, 2026-09-28): cellar-stack and the
-- legacy Nhost `local` database hold the same 5 rows — three valid UPC-A
-- codes (each becomes its GTIN-14; no merges), `''` and `ANNO\n1822` (opaque,
-- kept) — referenced by 6 item rows.

CREATE OR REPLACE FUNCTION public.gs1_check_digit_valid(digits text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
AS $$
-- GS1 mod 10 over a digit string whose last digit is the check digit.
-- Mirror of hasValidGs1CheckDigit in packages/contracts/src/barcodes.ts.
DECLARE
  total integer := 0;
  n integer := length(digits);
BEGIN
  IF n < 2 OR digits !~ '^[0-9]+$' THEN
    RETURN false;
  END IF;
  FOR i IN 1..n LOOP
    total := total + substr(digits, i, 1)::integer
                     * CASE WHEN (n - i) % 2 = 1 THEN 3 ELSE 1 END;
  END LOOP;
  RETURN total % 10 = 0;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.canonical_barcode_code(raw text, symbology text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
-- Mirror of canonicalBarcodeCode in packages/contracts/src/barcodes.ts; the
-- rules and their reasons are documented there. Helpers are schema-qualified
-- because pg_dump/pg_restore run with an empty search_path, and the
-- barcodes_code_canonical CHECK calls this while a restore loads the rows.
DECLARE
  code text;
  hint text;
  d text[];
  upc_a text;
  ean8_ok boolean;
  upce_ok boolean;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  code := btrim(raw, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13));
  IF code !~ '^[0-9]+$' THEN
    RETURN translate(code, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  END IF;
  IF length(code) NOT IN (8, 12, 13, 14) THEN
    RETURN code;
  END IF;
  IF length(code) <> 8 THEN
    RETURN CASE WHEN public.gs1_check_digit_valid(code) THEN lpad(code, 14, '0') ELSE code END;
  END IF;
  ean8_ok := public.gs1_check_digit_valid(code);
  upce_ok := false;
  IF left(code, 1) IN ('0', '1') THEN
    d := regexp_split_to_array(code, '');
    -- d[1] number system, d[2..7] the six data digits, d[8] the check digit.
    upc_a := d[1] || CASE
      WHEN d[7] IN ('0', '1', '2') THEN d[2] || d[3] || d[7] || '0000' || d[4] || d[5] || d[6]
      WHEN d[7] = '3' THEN d[2] || d[3] || d[4] || '00000' || d[5] || d[6]
      WHEN d[7] = '4' THEN d[2] || d[3] || d[4] || d[5] || '00000' || d[6]
      ELSE d[2] || d[3] || d[4] || d[5] || d[6] || '0000' || d[7]
    END || d[8];
    upce_ok := public.gs1_check_digit_valid(upc_a);
  END IF;
  hint := upper(regexp_replace(coalesce(symbology, ''), '[^A-Za-z0-9]', '', 'g'));
  IF upce_ok AND (NOT ean8_ok OR hint <> 'EAN8') THEN
    RETURN lpad(upc_a, 14, '0');
  END IF;
  RETURN CASE WHEN ean8_ok THEN lpad(code, 14, '0') ELSE code END;
END
$$;--> statement-breakpoint

DO $$
DECLARE
  total_rows integer;
  rewritten integer;
  merged_away integer;
  survivors integer;
  opaque integer;
  links integer;
BEGIN
  WITH mapped AS (
    SELECT code, public.canonical_barcode_code(code, type) AS canonical
      FROM public.barcodes
  )
  SELECT count(*),
         count(*) FILTER (WHERE code <> canonical),
         count(*) - count(DISTINCT canonical),
         (SELECT count(*) FROM (SELECT canonical FROM mapped GROUP BY canonical HAVING count(*) > 1) g),
         count(*) FILTER (WHERE canonical !~ '^[0-9]{14}$' OR NOT public.gs1_check_digit_valid(canonical))
    INTO total_rows, rewritten, merged_away, survivors, opaque
    FROM mapped;
  SELECT (SELECT count(*) FROM public.wines   t WHERE t.barcode_code <> public.canonical_barcode_code(t.barcode_code, (SELECT b.type FROM public.barcodes b WHERE b.code = t.barcode_code)))
       + (SELECT count(*) FROM public.beers   t WHERE t.barcode_code <> public.canonical_barcode_code(t.barcode_code, (SELECT b.type FROM public.barcodes b WHERE b.code = t.barcode_code)))
       + (SELECT count(*) FROM public.spirits t WHERE t.barcode_code <> public.canonical_barcode_code(t.barcode_code, (SELECT b.type FROM public.barcodes b WHERE b.code = t.barcode_code)))
       + (SELECT count(*) FROM public.coffees t WHERE t.barcode_code <> public.canonical_barcode_code(t.barcode_code, (SELECT b.type FROM public.barcodes b WHERE b.code = t.barcode_code)))
       + (SELECT count(*) FROM public.sakes   t WHERE t.barcode_code <> public.canonical_barcode_code(t.barcode_code, (SELECT b.type FROM public.barcodes b WHERE b.code = t.barcode_code)))
       + (SELECT count(*) FROM public.teas    t WHERE t.barcode_code <> public.canonical_barcode_code(t.barcode_code, (SELECT b.type FROM public.barcodes b WHERE b.code = t.barcode_code)))
    INTO links;
  RAISE NOTICE 'canonical_barcode_codes: % barcodes rows; % to rewrite; % merged away into % surviving codes; % opaque (kept as stored); % item links to repoint',
    total_rows, rewritten, merged_away, survivors, opaque, links;
END
$$;--> statement-breakpoint

WITH mapped AS (
  SELECT b.code,
         b.type,
         public.canonical_barcode_code(b.code, b.type) AS canonical,
         (SELECT count(*) FROM public.wines   WHERE barcode_code = b.code)
       + (SELECT count(*) FROM public.beers   WHERE barcode_code = b.code)
       + (SELECT count(*) FROM public.spirits WHERE barcode_code = b.code)
       + (SELECT count(*) FROM public.coffees WHERE barcode_code = b.code)
       + (SELECT count(*) FROM public.sakes   WHERE barcode_code = b.code)
       + (SELECT count(*) FROM public.teas    WHERE barcode_code = b.code) AS links
    FROM public.barcodes b
), merged AS (
  SELECT canonical,
         (array_agg(type ORDER BY links DESC, (code = canonical) DESC, code COLLATE "C")
            FILTER (WHERE type IS NOT NULL))[1] AS type
    FROM mapped
   GROUP BY canonical
  HAVING bool_or(code <> canonical)
)
INSERT INTO public.barcodes (code, type)
SELECT canonical, type FROM merged
ON CONFLICT (code) DO UPDATE
   SET type = EXCLUDED.type
 WHERE public.barcodes.type IS DISTINCT FROM EXCLUDED.type;--> statement-breakpoint

UPDATE public.wines t SET barcode_code = m.canonical
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE t.barcode_code = m.code AND m.canonical <> m.code;--> statement-breakpoint
UPDATE public.beers t SET barcode_code = m.canonical
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE t.barcode_code = m.code AND m.canonical <> m.code;--> statement-breakpoint
UPDATE public.spirits t SET barcode_code = m.canonical
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE t.barcode_code = m.code AND m.canonical <> m.code;--> statement-breakpoint
UPDATE public.coffees t SET barcode_code = m.canonical
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE t.barcode_code = m.code AND m.canonical <> m.code;--> statement-breakpoint
UPDATE public.sakes t SET barcode_code = m.canonical
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE t.barcode_code = m.code AND m.canonical <> m.code;--> statement-breakpoint
UPDATE public.teas t SET barcode_code = m.canonical
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE t.barcode_code = m.code AND m.canonical <> m.code;--> statement-breakpoint

UPDATE public.outbox o
   SET payload = jsonb_set(o.payload, '{code}', to_jsonb(m.canonical))
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE o.target_actor = 'ItemActor' AND o.method = 'setBarcode'
   AND o.status <> 'delivered'
   AND jsonb_typeof(o.payload -> 'code') = 'string'
   AND o.payload ->> 'code' = m.code AND m.canonical <> m.code;--> statement-breakpoint
UPDATE public.outbox o
   SET payload = jsonb_set(o.payload, '{barcodeCode}', to_jsonb(m.canonical))
  FROM (SELECT code, public.canonical_barcode_code(code, type) AS canonical FROM public.barcodes) m
 WHERE o.target_actor = 'ItemActor' AND o.method = 'create'
   AND o.status <> 'delivered'
   AND jsonb_typeof(o.payload -> 'barcodeCode') = 'string'
   AND o.payload ->> 'barcodeCode' = m.code AND m.canonical <> m.code;--> statement-breakpoint

DELETE FROM public.barcodes
 WHERE code <> public.canonical_barcode_code(code, type);
