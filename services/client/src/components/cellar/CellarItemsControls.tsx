"use client";

import { Button, Stack } from "@mui/joy";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useTransition } from "react";
import { MdAdd } from "react-icons/md";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Link } from "@/components/common/Link";
import { CellarItemsFilter } from "./CellarItemsFilter";
import type { CellarItemsFilterCounts as CellarItemCounts } from "./cellarItemCounts";
import { parseItemTypes } from "./cellarItemsQuery";

interface CellarItemsControlsProps {
  cellarId: string;
  cellarName: string;
  counts: CellarItemCounts;
  canAdd: boolean;
  initialSearch: string;
  initialTypes: ItemTypeValue[];
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
 */
export function CellarItemsControls({
  cellarId,
  cellarName,
  counts,
  canAdd,
  initialSearch,
  initialTypes,
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

  return (
    <HeaderBar
      serverBreadcrumbs={{
        cellarName,
      }}
      defaultSearchValue={search || initialSearch}
      isSearching={isPending}
      onSearchChange={handleSearchChange}
      endComponent={
        <Stack direction="row" spacing={2}>
          <CellarItemsFilter
            types={currentTypes}
            onTypesChange={handleTypesChange}
            counts={counts}
          />
          <Button
            component={Link}
            href={`/cellars/${cellarId}/items/add`}
            startDecorator={<MdAdd />}
            disabled={!canAdd}
          >
            Add item
          </Button>
        </Stack>
      }
    />
  );
}
