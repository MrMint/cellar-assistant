"use client";

import { useMemo, useState } from "react";
import { useQuery } from "urql";
import { Search } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { tryNextRows } from "./adapter";
import { TryThisNextSearchQuery } from "./queries";
import { WantToTryButton } from "./WantToTryButton";

/** Enough candidates that the list's own entries can be skipped and three remain. */
const SEARCH_LIMIT = 10;

export type TryThisNextProps = {
  /** The insight's sentence — a style or category, never a product. */
  recommendation: string;
  /** The list's item type; the search stays inside it. */
  itemType: ApiItemType;
  /** Board hrefs already on the list, which are not offered again. */
  onList: ReadonlySet<string>;
};

/**
 * X08's Save target on insights: under "Try This Next", one tap looks the
 * suggestion up in the catalog and offers up to three real bottles, each
 * with the Want to try bookmark. The model named a style; the search names
 * the bottles — and the label says so, so nothing reads as the AI's pick.
 *
 * Asked for, not automatic: a text search may embed the phrase, which costs
 * an AI call, and the insight is readable without it.
 */
export function TryThisNext({
  recommendation,
  itemType,
  onList,
}: TryThisNextProps) {
  const [asked, setAsked] = useState(false);
  const [{ data, fetching, error }, reexecute] = useQuery({
    query: TryThisNextSearchQuery,
    variables: {
      text: recommendation,
      itemTypes: [itemType],
      limit: SEARCH_LIMIT,
      first: SEARCH_LIMIT,
    },
    pause: !asked,
  });

  const result = useMemo(
    () =>
      data === undefined
        ? null
        : unwrapResult(data.itemSearch, "ItemSearchConnection"),
    [data],
  );
  const rows = useMemo(
    () =>
      result?.ok === true
        ? tryNextRows(
            result.data.edges.map((edge) => edge.node),
            onList,
          )
        : [],
    [result, onList],
  );

  if (!asked) {
    return (
      <Button
        variant="secondary"
        className="mt-3 self-start"
        onClick={() => setAsked(true)}
      >
        <Search aria-hidden />
        Find bottles like this
      </Button>
    );
  }

  if (fetching && data === undefined) {
    return (
      <div
        role="status"
        aria-label="Searching the catalog"
        className="mt-3 flex flex-col gap-2"
      >
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (error !== undefined || result?.ok === false) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="type-footnote">Couldn't search the catalog just now.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => reexecute({ requestPolicy: "network-only" })}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="type-footnote mt-3">
        Nothing in the catalog matches this yet.
      </p>
    );
  }

  return (
    <InsetSection label="Catalog matches" className="mt-3">
      {rows.map((row) => (
        <ListRow
          key={row.key}
          className="bg-surface-2"
          leading={
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-sm",
                itemTypeTokens[row.target.itemType].tintClass,
              )}
            >
              <TypeGlyph type={row.target.itemType} className="size-4" />
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
          trailing={
            <WantToTryButton
              target={row.target}
              saved={row.saved}
              name={row.title}
            />
          }
        />
      ))}
    </InsetSection>
  );
}
