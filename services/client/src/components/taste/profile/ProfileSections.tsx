/**
 * The middle of `/taste-profile` (Social-Recap board 19, 20): the styles you
 * rate highest (your gold stars, your averages), what the profile is built
 * from (a bar per kind, each opening your top rated in that kind), and the
 * door to the insights on your lists.
 */
import type { ReactNode } from "react";
import { ChevronRight, ICON_STROKE, Lists } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { formatKitScore, Stars } from "@/components/app/parts/Stars";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { feedback } from "@/lib/feedback";
import { styleLabel, typeBarWidths } from "../taste-lines";

/** A section heading with its quiet unit at the right ("styles", "rated"). */
export function ProfileSection({
  title,
  unit,
  children,
}: {
  title: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-head text-ink-1">{title}</h2>
        {unit !== undefined && <span className="t-cap text-ink-2">{unit}</span>}
      </div>
      <div className="flex flex-col overflow-hidden rounded-md border border-edge bg-card">
        {children}
      </div>
    </section>
  );
}

const ROW =
  "flex min-h-14 items-center gap-3 px-4 not-first:border-hair not-first:border-t";

export function RatedHighest({
  styles,
}: {
  styles: readonly {
    readonly itemType: ApiItemType;
    readonly label: string;
    readonly average: number;
  }[];
}) {
  return (
    <ProfileSection title="Rated highest" unit="styles">
      <ul aria-label="Styles you rate highest" className="contents">
        {styles.map((style) => {
          const Glyph = itemTypeTokens[style.itemType].glyph;
          return (
            <li key={`${style.itemType}:${style.label}`} className={ROW}>
              <Glyph
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-6 shrink-0 text-glyph"
              />
              <span className="t-body min-w-0 flex-1 truncate text-ink-1">
                {styleLabel(style.label)}
              </span>
              <Stars value={style.average} tone="owner" size="sm" />
              <span className="t-cap tabular w-8 text-right text-ink-2">
                {formatKitScore(style.average)}
              </span>
            </li>
          );
        })}
      </ul>
    </ProfileSection>
  );
}

export function BuiltFrom({
  types,
}: {
  types: readonly { readonly itemType: ApiItemType; readonly count: number }[];
}) {
  return (
    <ProfileSection title="What it’s built from" unit="rated">
      {typeBarWidths(types).map((row) => {
        const label = itemTypeTokens[row.itemType].label;
        return (
          <Link
            key={row.itemType}
            href={`/rankings?types=${row.itemType}`}
            underline="none"
            onClick={() => feedback("tick")}
            aria-label={`${label}, ${row.count} rated, see them ranked`}
            className={`${ROW} text-ink-1 active:bg-sel`}
          >
            <span className="t-body w-20 shrink-0">{label}</span>
            <span aria-hidden className="relative h-3 flex-1">
              <span
                className="absolute inset-y-0 left-0 rounded-sm bg-act"
                style={{ width: `${row.percent}%` }}
              />
            </span>
            <span className="t-cap tabular w-10 text-right text-ink-2">
              {row.count}
            </span>
            <ChevronRight
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 shrink-0 text-glyph"
            />
          </Link>
        );
      })}
    </ProfileSection>
  );
}

/** Insights live on each list; the door opens your lists. */
export function InsightsDoor() {
  return (
    <Link
      href="/tier-lists"
      underline="none"
      onClick={() => feedback("tick")}
      className="t-body flex min-h-14 items-center gap-3 rounded-md border border-edge bg-card px-4 text-ink-1 active:bg-sel"
    >
      <Lists
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-6 shrink-0 text-glyph"
      />
      <span className="flex-1">Insights from your lists</span>
      <ChevronRight
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-glyph"
      />
    </Link>
  );
}
