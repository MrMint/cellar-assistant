"use client";

import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useTransition } from "react";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { SortChip } from "@/components/app/SortChip";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";
import { HeaderBar } from "@/components/common/HeaderBar";
import { AddItemButton } from "./AddItemButton";
import { CellarItemsFilter } from "./CellarItemsFilter";
import type { CellarItemsFilterCounts as CellarItemCounts } from "./cellarItemCounts";
import {
  CELLAR_SORTS,
  CELLAR_STATUSES,
  type CellarSort,
  type CellarStatus,
  DEFAULT_CELLAR_SORT,
  DEFAULT_CELLAR_STATUS,
  parseCellarSort,
  parseCellarStatus,
  parseItemTypes,
} from "./cellarItemsQuery";

interface CellarItemsControlsProps {
  cellarId: string;
  cellarName: string;
  counts: CellarItemCounts;
  canAdd: boolean;
  initialSearch: string;
  initialTypes: ItemTypeValue[];
  initialSort: CellarSort;
  initialStatus: CellarStatus;
}

/**
 * `82450ad1:src/components/cellar/CellarItemsControls.tsx`, restored.
 *
 * `HeaderBar` with the cellar's breadcrumb, the 300 ms search, the type filter
 * with per-type counts (`Cellar.itemCounts`, G1) and "Add item". URL state is
 * the old `nuqs` pair with `shallow: false`, so a change re-renders the server
 * page, which fetches the matching first page. Search is a semantic re-sort,
 * as it always was (`semanticQuery`), not a text filter.
 *
 * One change: "Add item" linked to the relative `items/add` (§7); it takes the
 * cellar id and links absolutely.
 *
 * Below `sm` the filter and "Add item" stack under the search field, and the
 * filter's chips wrap, so nothing is wider than the screen (e2e m05: the old
 * one-line row pushed all three past the 16 px gutter at 375).
 *
 * N13b adds the status segment (In cellar · Finished · All, `?status=`) above
 * the type chips, and the sort chip (`?sort=`) beside "Add item" — both in
 * the URL like the rest, so a reload or a shared link keeps them. While a
 * search is active the order is the search's, and the chip says so.
 */
export function CellarItemsControls({
  cellarId,
  cellarName,
  counts,
  canAdd,
  initialSearch,
  initialTypes,
  initialSort,
  initialStatus,
}: CellarItemsControlsProps) {
  const [isPending, startTransition] = useTransition();
  const hasMounted = useRef(false);

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // nuqs hooks with shallow: false to trigger RSC re-render
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      shallow: false,
      throttleMs: 300, // Built-in debounce
      startTransition,
    }),
  );

  const [types, setTypes] = useQueryState(
    "types",
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: false,
      startTransition,
    }),
  );

  const [sortParam, setSortParam] = useQueryState(
    "sort",
    parseAsString.withOptions({ shallow: false, startTransition }),
  );
  const [statusParam, setStatusParam] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false, startTransition }),
  );
  // Before mount the server's parse; after, the URL (as with types below).
  const sort = hasMounted.current ? parseCellarSort(sortParam) : initialSort;
  const status = hasMounted.current
    ? parseCellarStatus(statusParam)
    : initialStatus;

  const handleSearchChange = (value: string) => {
    setSearch(value || null); // null removes the param
  };

  const handleTypesChange = (newTypes: ItemTypeValue[]) => {
    setTypes(newTypes.length > 0 ? newTypes : null);
  };

  // Before mount, use server-provided initial values to prevent hydration mismatch.
  // After mount, trust URL state from nuqs (allows clearing filters).
  const validatedTypes = parseItemTypes(types);
  const currentTypes = hasMounted.current
    ? validatedTypes
    : validatedTypes.length > 0
      ? validatedTypes
      : initialTypes;

  const searching = (search || initialSearch).trim() !== "";

  return (
    <HeaderBar
      serverBreadcrumbs={{
        cellarName,
      }}
      defaultSearchValue={search || initialSearch}
      isSearching={isPending}
      onSearchChange={handleSearchChange}
      searchLabel="Search this cellar"
      endComponent={
        <div className="flex min-w-0 flex-col gap-3">
          <SegmentedControl
            aria-label="Show"
            value={status}
            onValueChange={(next) =>
              setStatusParam(next === DEFAULT_CELLAR_STATUS ? null : next)
            }
            options={CELLAR_STATUSES}
            className="sm:max-w-sm"
          />
          <CellarItemsFilter
            types={currentTypes}
            onTypesChange={handleTypesChange}
            counts={counts}
          />
          <div className="flex items-center justify-between gap-3">
            <SortChip
              options={CELLAR_SORTS}
              value={sort}
              onValueChange={(next) =>
                setSortParam(next === DEFAULT_CELLAR_SORT ? null : next)
              }
              overriddenBy={searching ? "Best match" : undefined}
            />
            <AddItemButton cellarId={cellarId} canAdd={canAdd} />
          </div>
        </div>
      }
    />
  );
}
