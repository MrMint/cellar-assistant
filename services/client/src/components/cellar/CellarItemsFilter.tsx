import { FilterChip } from "@/components/app/FilterChip";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";

type CellarItemsFilterProps = {
  types?: ItemTypeValue[];
  counts?: {
    beers?: number;
    wines?: number;
    spirits?: number;
    coffees?: number;
    sakes?: number;
    teas?: number;
  };
  onTypesChange: (types: ItemTypeValue[]) => void;
};

/**
 * The old filter's six types in the old order (beer, wine, spirit, coffee,
 * sake, tea), each a `FilterChip`: glyph, word and count, any number on at
 * once. A count of zero is hidden (design §3.7); an absent count shows none.
 */
const FILTER_TYPES = [
  { type: "BEER", count: "beers" },
  { type: "WINE", count: "wines" },
  { type: "SPIRIT", count: "spirits" },
  { type: "COFFEE", count: "coffees" },
  { type: "SAKE", count: "sakes" },
  { type: "TEA", count: "teas" },
] as const satisfies readonly {
  type: ItemTypeValue;
  count: keyof NonNullable<CellarItemsFilterProps["counts"]>;
}[];

/**
 * Filter a list by item type (the cellar's items, favourites, rankings).
 *
 * Was a Joy `ToggleButtonGroup` of glyph-only buttons labelled "text
 * formatting"; now a named group (a `fieldset`) of `FilterChip`s that wraps
 * rather than running past a 375 px screen (e2e m05). Same props, same toggling: a tap
 * adds the type to `types` or takes it out.
 */
export const CellarItemsFilter = ({
  types = [],
  counts = {},
  onTypesChange,
}: CellarItemsFilterProps) => {
  const toggle = (type: ItemTypeValue) =>
    onTypesChange(
      types.includes(type)
        ? types.filter((value) => value !== type)
        : [...types, type],
    );

  return (
    <div data-slot="cellar-items-filter" className="flex min-w-0">
      <fieldset
        aria-label="Filter by type"
        className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
      >
        {FILTER_TYPES.map(({ type, count }) => {
          const { label } = itemTypeTokens[type];
          return (
            <FilterChip
              key={type}
              aria-label={label}
              selected={types.includes(type)}
              onClick={() => toggle(type)}
              icon={<TypeGlyph type={type} />}
              count={counts[count]}
            >
              {label}
            </FilterChip>
          );
        })}
      </fieldset>
    </div>
  );
};
