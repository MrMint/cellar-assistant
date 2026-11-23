import { Suspense } from "react";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { cn } from "@/lib/utils";
import type { CellarGridItem } from "./adapter";
import { BottleShelf } from "./BottleShelf";
import {
  type DashboardData,
  type DrinkSoonRow,
  dashboardTiles,
  drinkSoonRows,
  type TypeCounts,
} from "./dashboard";
import { PourScope } from "./PourButton";
import { PourTrend } from "./PourTrend";
import { StatTiles } from "./StatTiles";
import { TimeZoneSync } from "./TimeZoneSync";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bottles for the "Recently added" shelf: still in the cellar, added within
 * the window, and not already on "Open now" above it.
 */
export const recentShelf = (
  recent: readonly CellarGridItem[],
  openNow: readonly CellarGridItem[],
  { asOf, days }: { asOf: number; days: number },
): CellarGridItem[] => {
  const open = new Set(openNow.map((cell) => cell.item.id));
  const since = asOf - days * DAY_MS;
  return recent.filter((cell) => {
    const added = Date.parse(cell.bottle.createdAt ?? "");
    return !open.has(cell.item.id) && !Number.isNaN(added) && added >= since;
  });
};

/** How many Drink soon rows a cellar's dashboard shows. */
const DRINK_SOON_LIMIT = 10;

/** The rows, drawn: pure, so it renders in a test without a server. */
export function DrinkSoonList({ rows }: { rows: readonly DrinkSoonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <InsetSection label="Drink soon" aria-label="Drink soon">
      {rows.map((row) => (
        <ListRow
          key={row.id}
          data-slot="cellar-drink-soon"
          leading={
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-md",
                itemTypeTokens[row.type].tintClass,
              )}
            >
              <TypeGlyph type={row.type} className="size-5" />
            </span>
          }
          title={
            <Link
              href={row.href}
              overlay
              underline="none"
              className="text-ink-1"
            >
              {row.title}
            </Link>
          }
          description={
            <span className={cn(row.past && "text-ink-1")}>{row.line}</span>
          }
        />
      ))}
    </InsetSection>
  );
}

/**
 * L02: this cellar's Drink soon, streamed on its own so the dashboard never
 * waits on it, and failing on its own (nothing drawn).
 */
async function CellarDrinkSoon({ cellarId }: { cellarId: string }) {
  // Imported here, not at the top: the server client reads request cookies,
  // and this file's pure helpers are imported by tests.
  const [{ apiServerQuery }, { CellarDrinkSoonQuery }] = await Promise.all([
    import("@/lib/api/urql-server"),
    import("./fragments"),
  ]);
  const data = await apiServerQuery(CellarDrinkSoonQuery, {
    cellarId,
    first: DRINK_SOON_LIMIT,
  }).catch(() => null);
  const cellar = data?.cellar?.__typename === "Cellar" ? data.cellar : null;
  const nodes = cellar?.drinkSoon.edges.map((edge) => edge.node) ?? [];
  return <DrinkSoonList rows={drinkSoonRows(nodes)} />;
}

/**
 * The top of a cellar's page (X04, D3 — "make the top a dashboard"): what is
 * open now, with Pour (X03's sheet, one for both shelves); the numbers (in the cellar by type, open, almost
 * empty, finished this month); pours per month; what came in recently. Then
 * the page's collection.
 *
 * Every count is bottles (D13). Months are the viewer's (`TimeZoneSync`).
 */
export function CellarDashboard({
  cellarId,
  data,
  typeCounts,
  openNow,
  openCount,
  recent,
  asOf,
  canPour,
}: {
  cellarId: string;
  data: DashboardData;
  typeCounts: TypeCounts;
  openNow: readonly CellarGridItem[];
  /** Every open bottle, though the shelf shows only its first page. */
  openCount: number;
  recent: readonly CellarGridItem[];
  asOf: number;
  /** The viewer owns (or co-owns) the cellar: Pour, rather than Check in. */
  canPour: boolean;
}) {
  const recentCells = recentShelf(recent, openNow, {
    asOf,
    days: data.recentDays,
  });
  return (
    <PourScope>
      <div data-slot="cellar-dashboard" className="flex flex-col gap-5">
        <TimeZoneSync renderedZone={data.timeZone} />
        <BottleShelf
          slot="open-now-shelf"
          title="Open now"
          detail={String(openCount)}
          cellarId={cellarId}
          cells={openNow}
          asOf={asOf}
          canPour={canPour}
        />
        {canPour && (
          <Suspense fallback={null}>
            <CellarDrinkSoon cellarId={cellarId} />
          </Suspense>
        )}
        <StatTiles tiles={dashboardTiles(cellarId, data, typeCounts)} />
        <PourTrend
          logsByMonth={data.logsByMonth}
          currentMonth={data.currentMonth}
        />
        <BottleShelf
          slot="recent-shelf"
          title="Recently added"
          detail={`last ${data.recentDays} days`}
          cellarId={cellarId}
          cells={recentCells}
          asOf={asOf}
          canPour={canPour}
        />
      </div>
    </PourScope>
  );
}
