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
import { useEffect, useState } from "react";
import { useQuery } from "urql";
import { ChevronRight, ICON_STROKE, Trophy } from "@/components/app/icons";
import { InsetSection, ListRow } from "@/components/app/Page";
import { RecapStamp } from "@/components/recap/RecapStamp";
import { recapPeriodLabel } from "@/components/recap/recap-copy";
import {
  BreadthStampsQuery,
  stampsFromResult,
} from "@/components/recap/recap-data";
import { PressLink } from "./PressLink";

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
  const now = new Date();
  const label = recapPeriodLabel(
    { kind: "month", year: now.getFullYear(), month: now.getMonth() + 1 },
    now,
  );
  return (
    <InsetSection label="Stamps">
      {stamps.length > 0 && (
        <ul
          data-slot="me-stamps"
          aria-label="Your stamps"
          className="m-0 flex list-none gap-4 overflow-x-auto px-3.5 py-4"
        >
          {stamps.map((stamp) => (
            <li key={stamp.kind} className="flex">
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
