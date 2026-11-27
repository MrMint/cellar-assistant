/**
 * The deck's last card (Social-Recap board, "The end"): the period's counts as
 * stat tiles, the MC-recap totals in one line, and the doors on from here.
 * Its Start over and Share live in the deck's footer (SR-5).
 */
import type { ReactNode } from "react";
import {
  Category,
  ChevronRight,
  History,
  ICON_STROKE,
  Trophy,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { StatGrid, StatTile } from "@/components/app/parts/StatTile";
import { feedback } from "@/lib/feedback";
import { recapTotalsLine } from "./recap-copy";
import type { RecapEndView } from "./recap-data";

export function RecapEndCard({
  end,
  short,
  onOtherRecaps,
  doors = true,
}: {
  end: RecapEndView;
  /** "December", "2024". */
  short: string;
  onOtherRecaps: () => void;
  /** Desktop puts the doors in the side column instead. */
  doors?: boolean;
}) {
  const totals = recapTotalsLine(end.totals);
  return (
    <div data-slot="recap-end" className="flex flex-col gap-4">
      <span className="t-cap text-ink-2">The end</span>
      <span className="t-title text-ink-1">That’s your {short}</span>
      {end.stats.length > 0 && (
        <StatGrid>
          {end.stats.map((stat) => (
            <StatTile key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </StatGrid>
      )}
      {totals !== "" && (
        <p data-slot="recap-totals" className="t-cap tabular text-ink-2">
          {totals}
        </p>
      )}
      {doors && <RecapDoors onOtherRecaps={onOtherRecaps} />}
    </div>
  );
}

/** Your taste profile, your top rated, and (on phones) the other recaps. */
export function RecapDoors({
  onOtherRecaps,
  otherRecaps = true,
}: {
  onOtherRecaps: () => void;
  otherRecaps?: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-edge">
      <DoorLink
        href="/taste-profile"
        icon={
          <Category
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-6 text-glyph"
          />
        }
      >
        Your taste profile
      </DoorLink>
      <DoorLink
        href="/rankings"
        icon={
          <Trophy
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-6 text-glyph"
          />
        }
      >
        Your top rated
      </DoorLink>
      {otherRecaps && (
        <button
          type="button"
          onClick={() => {
            feedback("tick");
            onOtherRecaps();
          }}
          className="t-body flex min-h-14 items-center gap-3 border-hair border-t px-4 text-left text-ink-1 active:bg-sel"
        >
          <History
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-6 text-glyph"
          />
          <span className="flex-1">Other recaps</span>
          <ChevronRight
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-5 text-glyph"
          />
        </button>
      )}
    </div>
  );
}

function DoorLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      underline="none"
      onClick={() => feedback("tick")}
      className="t-body flex min-h-14 items-center gap-3 px-4 text-ink-1 not-first:border-hair not-first:border-t active:bg-sel"
    >
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 text-glyph"
      />
    </Link>
  );
}
