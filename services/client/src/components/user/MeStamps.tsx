"use client";

/**
 * Stamps on the Me hub (ux-c M4, filled by L04): no props, its own data.
 *
 * A slot. It fetches its own data through urql and renders nothing until it
 * has some (plan L38) — nothing at all on the server or before mount, so the
 * hub's markup is unchanged until the read lands. Then: the viewer's breadth
 * stamps (counts of distinct things only: styles, regions, kinds of drink,
 * recipes made) and the way into this month's recap.
 */
import { BREADTH_STAMP_KINDS } from "@cellar-assistant/contracts/recap";
import { useEffect, useState } from "react";
import { useQuery } from "urql";
import { ChevronRight, ICON_STROKE, Trophy } from "@/components/app/icons";
import { InsetSection, ListRow } from "@/components/app/Page";
import { RecapStamp } from "@/components/recap/RecapStamp";
import { recapPeriodLabel } from "@/components/recap/recap-copy";
import {
  type BreadthStampData,
  BreadthStampsQuery,
  stampsFromResult,
} from "@/components/recap/recap-data";
import { PressLink } from "./PressLink";
import { BOLD_LABEL } from "./section-label";

export function MeStamps() {
  // Mounted first: no query, no markup, on the server or in a static render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <MeStampsLoaded /> : null;
}

function MeStampsLoaded() {
  const [result] = useQuery({ query: BreadthStampsQuery });
  const stamps = stampsFromResult(result.data);
  if (stamps === null) return null;
  return <MeStampsView stamps={stamps} now={new Date()} />;
}

/**
 * The section itself, from stamps already read: a bold "Stamps" head with
 * how many of the four breadth stamps are earned ("3 of 4", F-133), the
 * stamps four to a row with their nouns under them, then this month's recap.
 */
export function MeStampsView({
  stamps,
  now,
}: {
  stamps: readonly BreadthStampData[];
  now: Date;
}) {
  const label = recapPeriodLabel(
    { kind: "month", year: now.getFullYear(), month: now.getMonth() + 1 },
    now,
  );
  return (
    <InsetSection
      label="Stamps"
      className={BOLD_LABEL}
      action={
        stamps.length > 0 ? (
          <span
            data-slot="me-stamps-count"
            className="t-cap tabular text-ink-2"
          >
            {`${stamps.length} of ${BREADTH_STAMP_KINDS.length}`}
          </span>
        ) : undefined
      }
    >
      {stamps.length > 0 && (
        <ul
          data-slot="me-stamps"
          aria-label="Your stamps"
          className="m-0 grid list-none grid-cols-4 justify-items-center gap-2 px-3.5 py-4"
        >
          {stamps.map((stamp) => (
            <li key={stamp.kind} className="flex w-full min-w-0 justify-center">
              <RecapStamp stamp={stamp} size="sm" />
            </li>
          ))}
        </ul>
      )}
      <ListRow
        leading={
          <span className="flex size-10 items-center justify-center rounded-md bg-raised text-glyph">
            <Trophy aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
          </span>
        }
        title={
          <PressLink
            href="/recap"
            overlay
            underline="none"
            className="text-ink"
          >
            {`${label} recap`}
          </PressLink>
        }
        description={
          stamps.length === 0
            ? "Stamps count new styles, regions and recipes"
            : "Your latest month"
        }
        trailing={
          <ChevronRight
            aria-hidden
            className="size-5 text-glyph"
            strokeWidth={ICON_STROKE}
          />
        }
      />
    </InsetSection>
  );
}
