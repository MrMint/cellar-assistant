"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { FilterChip } from "@/components/app/FilterChip";
import { People } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { formatKitScore, StarGlyph } from "@/components/app/parts/Stars";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import { TasteAgreementFieldsFragment, TasteAgreementQuery } from "../queries";
import { type AgreementCounts, agreementCounts } from "../taste-lines";
import {
  type CompareRow,
  compareKinds,
  compareRow,
  compareTile,
  firstName,
} from "./compare-lines";
import { COMPARE_PAGE_SIZE, TasteCompareQuery } from "./queries";

/** The rows the server sent, the gone items left out. */
const presentRows = (rows: readonly (CompareRow | null)[]): CompareRow[] =>
  rows.filter((row): row is CompareRow => row !== null);

function Score({ value, mine }: { value: number; mine: boolean }) {
  return (
    <span className="flex w-14 shrink-0 items-center justify-end gap-1 tabular-nums">
      <StarGlyph
        fraction={1}
        fillClass={mine ? "text-gold" : "text-ink-2"}
        className="size-3.5"
      />
      <span className="t-head text-ink">{formatKitScore(value)}</span>
    </span>
  );
}

/** One drink you both rated: its plate, name, and the two scores. */
function CompareRowView({ row, them }: { row: CompareRow; them: string }) {
  return (
    <li
      data-slot="compare-row"
      className="relative flex min-h-16 items-center gap-3 py-2"
    >
      <span
        aria-hidden
        className="size-11 shrink-0 overflow-hidden rounded-sm bg-raised"
      >
        {row.itemType !== null && (
          <LabelPlate type={row.itemType} plate={{ name: row.title }} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Link
          href={row.href}
          overlay
          underline="none"
          className="t-head line-clamp-2 text-ink"
        >
          {row.title}
        </Link>
        {row.apart !== null && (
          <span className="t-cap text-ink-2">{row.apart}</span>
        )}
      </span>
      <span className="sr-only">
        {`You ${formatKitScore(row.mine)}, ${them} ${formatKitScore(row.theirs)}`}
      </span>
      <span aria-hidden className="flex shrink-0 gap-2">
        <Score value={row.mine} mine />
        <Score value={row.theirs} mine={false} />
      </span>
    </li>
  );
}

/** The "12 of 13" tile. */
function Tile({
  counts,
  kind,
}: {
  counts: AgreementCounts;
  kind: ApiItemType | null;
}) {
  const tile = compareTile(counts, kind);
  return (
    <div
      data-slot="compare-tile"
      className="flex flex-col gap-1 rounded-lg border border-edge bg-surface-1 p-4"
    >
      {tile.agreed === null ? (
        <p className="t-head text-ink">{tile.line}</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2 text-ink">
            <span className="t-score tabular-nums">{tile.agreed}</span>
            <span className="t-head text-ink-2">of {tile.shared}</span>
          </p>
          <p className="t-cap text-ink-2">{tile.line}</p>
        </>
      )}
    </div>
  );
}

/**
 * Compare taste with one friend (Social-Friends 09, 10, desktop 04): kind
 * chips, the agreement tile, then every drink you both rated side by side,
 * biggest gap first (MC-compare, L11). Only the viewer's own score wears
 * gold. The server answers a non-friend with no rows, so this never shows a
 * stranger's scores; a refused agreement shows the empty state.
 */
export function CompareView({
  userId,
  name,
  className,
}: {
  userId: string;
  name: string;
  className?: string;
}) {
  const them = firstName(name);
  const [kind, setKind] = useState<ApiItemType | null>(null);
  const [{ data }] = useQuery({
    query: TasteAgreementQuery,
    variables: { userId },
  });
  const paged = usePagedConnection({
    query: TasteCompareQuery,
    variables: (itemType: ApiItemType | null, after) => ({
      userId,
      itemType,
      first: COMPARE_PAGE_SIZE,
      after,
    }),
    select: (answer) => {
      const result = unwrapResult(answer?.tasteCompare, "TasteCompare");
      if (!result.ok) return result;
      return {
        ok: true as const,
        data: {
          rows: result.data.rows.edges.map((edge) => compareRow(edge.node)),
          endCursor: result.data.rows.pageInfo.endCursor ?? null,
          hasNextPage: result.data.rows.pageInfo.hasNextPage,
          totalCount: result.data.rows.totalCount ?? null,
        },
      };
    },
    initial: null,
    initialArgs: null,
  });

  const agreement =
    data === undefined
      ? undefined
      : unwrapResult(data.tasteAgreement, "TasteAgreement");
  if (agreement !== undefined && !agreement.ok) {
    return (
      <EmptyState
        className={className}
        illustration={<People aria-hidden strokeWidth={1.5} />}
        title="Nothing to compare yet"
      />
    );
  }
  const counts =
    agreement === undefined
      ? undefined
      : agreementCounts(
          readFragment(TasteAgreementFieldsFragment, agreement.data),
        );
  const rows = presentRows(paged.rows);
  const loading = paged.status !== "idle";

  const choose = (next: ApiItemType | null) => {
    if (next === kind) return;
    setKind(next);
    void paged.reset(next);
  };

  return (
    <section
      data-slot="taste-compare-view"
      aria-label={`You and ${them}`}
      aria-busy={loading || undefined}
      className={cn("flex flex-col gap-4", className)}
    >
      {counts === undefined ? (
        <Skeleton className="h-11 w-full" />
      ) : (
        <fieldset className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <legend className="sr-only">Kind</legend>
          <FilterChip
            selected={kind === null}
            count={counts.shared}
            onClick={() => choose(null)}
          >
            All
          </FilterChip>
          {compareKinds(counts).map((cell) => (
            <FilterChip
              key={cell.value}
              selected={kind === cell.value}
              count={cell.count}
              onClick={() => choose(cell.value)}
            >
              {cell.label}
            </FilterChip>
          ))}
        </fieldset>
      )}
      {counts === undefined ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <Tile counts={counts} kind={kind} />
      )}
      {rows.length > 0 && (
        <div className="flex flex-col">
          <div
            aria-hidden
            className="t-micro flex items-center gap-3 pb-1 text-ink-2"
          >
            <span className="w-11 shrink-0" />
            <span className="flex-1">Drink</span>
            <span className="w-14 text-right">You</span>
            <span className="w-14 truncate text-right">{them}</span>
          </div>
          <ul
            aria-label={`Drinks you and ${them} both rated`}
            className="flex flex-col divide-y divide-hair"
          >
            {rows.map((row) => (
              <CompareRowView key={row.id} row={row} them={them} />
            ))}
          </ul>
        </div>
      )}
      {paged.failure !== null && (
        <ErrorState
          title="Couldn't load your shared drinks"
          action={
            <Button variant="ghost" onClick={() => void paged.reset(kind)}>
              Try again
            </Button>
          }
        />
      )}
      {paged.canLoadMore && (
        <Button
          variant="quiet"
          className="self-start"
          disabled={loading}
          aria-busy={loading || undefined}
          onClick={() => void paged.loadMore()}
        >
          Show more
        </Button>
      )}
    </section>
  );
}
