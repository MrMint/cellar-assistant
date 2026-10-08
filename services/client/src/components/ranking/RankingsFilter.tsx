import { FilterChip } from "@/components/app/FilterChip";
import { ICON_STROKE, People, Person } from "@/components/app/icons";

export enum RankingsFilterValue {
  ME = "ME",
  FRIENDS = "FRIENDS",
}

type RankingsFilterProps = {
  types?: RankingsFilterValue[];
  onTypesChange: (types: RankingsFilterValue[]) => void;
};

const OPTIONS = [
  { value: RankingsFilterValue.ME, label: "Your Scores", Icon: Person },
  { value: RankingsFilterValue.FRIENDS, label: "Friends Scores", Icon: People },
] as const;

/**
 * Whose scores the board ranks: yours, your friends', both, or — with
 * neither pressed — everyone's (`scopeFromReviewers`). Two independent
 * toggles, as the Joy `ToggleButtonGroup` was (not a `SegmentedControl`,
 * which picks exactly one): `aria-pressed` chips with the label always shown
 * rather than an icon behind a hover tooltip.
 */
export const RankingsFilter = ({
  types = [],
  onTypesChange,
}: RankingsFilterProps) => {
  const toggle = (value: RankingsFilterValue) =>
    onTypesChange(
      types.includes(value)
        ? types.filter((t) => t !== value)
        : // Keep the URL's order stable: ME before FRIENDS.
          OPTIONS.map((o) => o.value).filter(
            (v) => v === value || types.includes(v),
          ),
    );

  return (
    <fieldset aria-label="Whose scores" className="m-0 flex gap-2 border-0 p-0">
      {OPTIONS.map(({ value, label, Icon }) => (
        <FilterChip
          key={value}
          selected={types.includes(value)}
          aria-label={label}
          icon={<Icon aria-hidden strokeWidth={ICON_STROKE} />}
          onClick={() => toggle(value)}
        >
          {label}
        </FilterChip>
      ))}
    </fieldset>
  );
};
