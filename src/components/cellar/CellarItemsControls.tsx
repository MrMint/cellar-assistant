"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { Button, Stack } from "@mui/joy";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useTransition } from "react";
import { MdAdd } from "react-icons/md";
import { parseItemTypes } from "@/app/(authenticated)/cellars/[cellarId]/items/searchParams";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Link } from "@/components/common/Link";
import { CellarItemsFilter } from "./CellarItemsFilter";
import type { CellarItemCounts } from "./cellarItemsServer";

interface CellarItemsControlsProps {
  cellarName: string;
  counts: CellarItemCounts;
  canAdd: boolean;
  initialSearch: string;
  initialTypes: ItemTypeValue[];
}

export function CellarItemsControls({
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
            href={"items/add"}
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
