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
import { ChevronRight, Trophy } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { RecapStamp } from "@/components/recap/RecapStamp";
import { recapPeriodLabel } from "@/components/recap/recap-copy";
import {
  BreadthStampsQuery,
  stampsFromResult,
} from "@/components/recap/recap-data";

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
          className="flex list-none gap-4 overflow-x-auto px-4 py-4"
        >
          {stamps.map((stamp) => (
            <li key={stamp.kind} className="flex">
              <RecapStamp stamp={stamp} size="sm" />
            </li>
          ))}
        </ul>
      )}
      <ListRow
        leading={<Trophy aria-hidden className="size-5" strokeWidth={1.75} />}
        title={
          <Link href="/recap" overlay underline="none" className="text-ink-1">
            {`${label} recap`}
          </Link>
        }
        description={
          stamps.length === 0
            ? "Stamps count new styles, regions and recipes"
            : undefined
        }
        trailing={
          <ChevronRight aria-hidden className="size-5" strokeWidth={1.75} />
        }
      />
    </InsetSection>
  );
}
