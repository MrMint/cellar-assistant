/**
 * The adapter between the new reference data and the old `EnumSelect` props.
 *
 * The old `EnumKey` was a key of `ENUM_REGISTRY`
 * (`82450ad1:functions/_packages/shared/enums/registry.ts`). Every key a
 * component at `82450ad1` actually passed maps onto a source the new client
 * already has: ten `ReferenceSource` aliases of `referenceData`, six
 * `STATIC_OPTIONS` Postgres enums, and `permission` — the SDL's
 * `PermissionType`. Each option's label is the old registry's `formatFn`.
 *
 * Plain module (not `"use client"`), so a server component can build options
 * too, and so the mapping is unit-testable without React.
 */

import type { introspection } from "@cellar-assistant/schema/graphql-env.d.ts";
import {
  type ReferenceSource,
  STATIC_OPTIONS,
  type StaticSource,
} from "@/components/item-api/itemFormRules";
import {
  formatBeerStyle,
  formatCountry,
  formatEnum,
  formatSakeCategory,
  formatSakeRiceVariety,
  formatSakeServingTemperature,
  formatSakeType,
  formatSpiritType,
  formatTeaCaffeineLevel,
  formatTeaCategory,
  formatTeaForm,
  formatWineStyle,
  formatWineVariety,
} from "@/utilities/formatters";

type PermissionValue = introspection["types"]["PermissionType"]["enumValues"];

/** Every old `enumKey` the restored forms pass. */
export type EnumKey = ReferenceSource | StaticSource | "permission";

export type EnumOption = { value: string; label: string };

/**
 * `cellar_permission` in its Hasura enum-table order (alphabetical, which is
 * what `order_by: value` returned). `satisfies` ties it to the SDL enum, so a
 * renamed value is a type error rather than an option the API refuses.
 */
export const PERMISSION_VALUES = [
  "FRIENDS",
  "PRIVATE",
  "PUBLIC",
] as const satisfies readonly PermissionValue[];

const FORMATTERS: Record<EnumKey, (value: string) => string | undefined> = {
  country: formatCountry,
  wineStyle: formatWineStyle,
  wineVariety: formatWineVariety,
  beerStyle: formatBeerStyle,
  spiritType: formatSpiritType,
  coffeeCultivar: formatEnum,
  coffeeRoastLevel: formatEnum,
  coffeeSpecies: formatEnum,
  coffeeProcess: formatEnum,
  sakeCategory: formatSakeCategory,
  sakeType: formatSakeType,
  sakeRiceVariety: formatSakeRiceVariety,
  sakeServingTemperature: formatSakeServingTemperature,
  teaCategory: formatTeaCategory,
  teaForm: formatTeaForm,
  teaCaffeineLevel: formatTeaCaffeineLevel,
  permission: formatEnum,
};

/** `PINOT_NOIR` → `Pinot Noir`, with the old per-enum spellings. */
export const formatEnumValue = (key: EnumKey, value: string): string =>
  FORMATTERS[key](value) ?? value;

const isStaticSource = (key: EnumKey): key is StaticSource =>
  key in STATIC_OPTIONS;

/**
 * The options for one key.
 *
 * `values` is the live list for a reference-table key (from
 * `useReferenceOptions`); static and permission keys ignore it and use their
 * constants. A reference key with no `values` yet has no options — the select
 * shows "Loading…" until the query lands, as the old one did.
 */
export const enumOptionsFor = (
  key: EnumKey,
  values?: readonly string[],
): EnumOption[] => {
  const source: readonly string[] =
    key === "permission"
      ? PERMISSION_VALUES
      : isStaticSource(key)
        ? STATIC_OPTIONS[key]
        : (values ?? []);
  return source.map((value) => ({
    value,
    label: formatEnumValue(key, value),
  }));
};

/**
 * The options a select renders for a field that already holds `value`.
 *
 * Joy's `Select` drops a selected value that is missing from its current
 * options — its list reducer filters it out on every `itemsChange` and calls
 * `onChange(null)` — so a stored or label-read value that arrives before its
 * option does (the countries past the first page of 100, say) used to be
 * erased: the edit form saved `country: null` over a stored SPAIN, and a
 * label read of SPAIN pre-filled nothing.
 *
 * While the options are still `loading`, the held value is kept as an option
 * of its own so the select has nothing to drop. Once they have loaded, a
 * value that is still not among them is **not** kept: every reference column
 * is a foreign key, and a value that is not a row would fail in the outbox
 * where nobody sees it.
 */
export const optionsHolding = (
  key: EnumKey,
  options: readonly EnumOption[],
  value: unknown,
  loading: boolean,
): EnumOption[] => {
  if (
    !loading ||
    typeof value !== "string" ||
    value === "" ||
    options.some((option) => option.value === value)
  ) {
    return [...options];
  }
  return [...options, { value, label: formatEnumValue(key, value) }];
};
