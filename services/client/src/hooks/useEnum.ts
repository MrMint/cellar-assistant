"use client";

import type {
  AttributeField,
  ReferenceSource,
} from "@/components/item-api/itemFormRules";
import { useReferenceOptions } from "@/components/item-api/useReferenceOptions";
import { type EnumKey, enumOptionsFor } from "./enum-options";

export type { EnumKey, EnumOption } from "./enum-options";

export interface UseEnumReturn {
  options: { value: string; label: string }[];
  loading: boolean;
  error: Error | null;
}

const REFERENCE_KEYS: ReadonlySet<string> = new Set<ReferenceSource>([
  "country",
  "wineStyle",
  "wineVariety",
  "beerStyle",
  "spiritType",
  "coffeeCultivar",
  "sakeCategory",
  "sakeType",
  "sakeRiceVariety",
  "teaCategory",
] satisfies ReferenceSource[]);

const isReferenceKey = (key: EnumKey): key is ReferenceSource =>
  REFERENCE_KEYS.has(key);

/**
 * `82450ad1:src/hooks/useEnum.ts`, over the new data layer.
 *
 * The old hook read Hasura enum tables through `EnumProvider` (server data)
 * and fell back to a client query. Here the ten reference tables come from
 * `useReferenceOptions` — one aliased `referenceData` operation that URQL
 * caches and every form on the page shares, with the second country page
 * already chased — and the Postgres-enum columns from `STATIC_OPTIONS`, so no
 * provider is needed. Labels are the old per-enum formatters
 * (`enum-options.ts`), not the rewrite's sentence case.
 *
 * `refetch` and `initialData` are gone: no caller at `82450ad1` passed either,
 * and URQL owns refetching.
 */
export function useEnum(enumKey: EnumKey): UseEnumReturn {
  const reference = useReferenceOptions();
  const needsQuery = isReferenceKey(enumKey);

  const options = (() => {
    if (enumKey === "country") {
      return enumOptionsFor(
        enumKey,
        reference.countries.map((option) => option.value),
      );
    }
    if (isReferenceKey(enumKey)) {
      const field: AttributeField = {
        key: enumKey,
        label: enumKey,
        kind: "reference",
        reference: enumKey,
      };
      return enumOptionsFor(
        enumKey,
        reference.optionsFor(field).map((option) => option.value),
      );
    }
    return enumOptionsFor(enumKey);
  })();

  return {
    options,
    loading: needsQuery ? reference.fetching : false,
    error: needsQuery && reference.error ? reference.error : null,
  };
}
