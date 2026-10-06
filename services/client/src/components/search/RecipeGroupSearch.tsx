"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Typography,
} from "@mui/joy";
import { useCallback, useRef, useState } from "react";
import { MdClear, MdRestaurant, MdSearch } from "react-icons/md";
import {
  type RecipeGroupCardData,
  recipeGroupCardFromNode,
} from "@/components/recipe/adapter";
import { RecipeGroupCardFragment } from "@/components/recipe/fragments";
import {
  RECIPE_GROUPS_PAGE_SIZE,
  RecipeGroupsQuery,
} from "@/components/recipe/queries";
import { VirtualizedRecipeGroupGrid } from "@/components/recipe/VirtualizedRecipeGroupGrid";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useEnum } from "@/hooks/useEnum";
import type { FragmentOf } from "@/lib/api/graphql";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";

/**
 * The SDL's `RecipeCategory`, in the old Select's style. The old Select offered
 * only "Cocktails" because its hook hard-coded `["cocktail"]`; the column has
 * five values, and a group in any of the other four could not be reached.
 */
const CATEGORY_OPTIONS = [
  { value: "cocktail", label: "Cocktails" },
  { value: "mocktail", label: "Mocktails" },
  { value: "punch", label: "Punches" },
  { value: "shot", label: "Shots" },
  { value: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number]["value"];

export type RecipeGroupSearchFilters = {
  searchTerm: string;
  category: "all" | Category;
  baseSpirit: string | null;
};

const DEFAULT_FILTERS: RecipeGroupSearchFilters = {
  searchTerm: "",
  category: "all",
  baseSpirit: null,
};

type Args = {
  term: string;
  category: "all" | Category;
  baseSpirit: string | null;
};

export type RecipeGroupSearchProps = {
  initialQuery?: string;
  onRecipeGroupSelect?: (groupId: string) => void;
  /** The server-rendered first page for `initialQuery` and no filters. */
  initialEdges?: readonly {
    node: FragmentOf<typeof RecipeGroupCardFragment>;
  }[];
  initialEndCursor?: string | null;
  initialHasNextPage?: boolean;
  initialTotalCount?: number | null;
};

/**
 * `82450ad1:src/components/search/RecipeGroupSearch.tsx`, restored — the
 * search card (one box, category and base-spirit Selects, "Clear All"), the
 * results line, and `VirtualizedRecipeGroupGrid`.
 *
 * `useOptimizedRecipeGroupSearch` (Hasura `_ilike`, offset paging, an LRU) →
 * `recipeGroups(term:, category:, baseSpirit:)` through `usePagedConnection`:
 * cursor paging, a real `totalCount`, and only the newest answer lands. Two
 * old filters that never reached the query now do — the base spirit (the old
 * hook dropped it) and every category (it hard-coded `cocktail`). The term
 * is G26: the old box's name / description / version-name substring.
 *
 * Spirit options are `referenceData(SPIRIT_TYPE)` (`useEnum("spiritType")`),
 * the successor of the old `spirit_type_enum` introspection; their values are
 * the same upper-case names it listed.
 */
export const RecipeGroupSearch = ({
  initialQuery = "",
  onRecipeGroupSelect,
  initialEdges,
  initialEndCursor = null,
  initialHasNextPage = false,
  initialTotalCount = null,
}: RecipeGroupSearchProps) => {
  const [filters, setFilters] = useState<RecipeGroupSearchFilters>({
    ...DEFAULT_FILTERS,
    searchTerm: initialQuery,
  });

  const list = usePagedConnection({
    query: RecipeGroupsQuery,
    variables: (args: Args, after) => ({
      first: RECIPE_GROUPS_PAGE_SIZE,
      after,
      term: args.term.trim() === "" ? null : args.term.trim(),
      category: args.category === "all" ? null : args.category,
      baseSpirit: args.baseSpirit,
    }),
    select: (data) =>
      pageOf(
        unwrapResult(data?.recipeGroups, "RecipeGroupConnection"),
        (edge): RecipeGroupCardData =>
          recipeGroupCardFromNode(
            readFragment(RecipeGroupCardFragment, edge.node),
          ),
      ),
    initial:
      initialEdges === undefined
        ? null
        : {
            rows: initialEdges.map((edge) =>
              recipeGroupCardFromNode(
                readFragment(RecipeGroupCardFragment, edge.node),
              ),
            ),
            endCursor: initialEndCursor,
            hasNextPage: initialHasNextPage,
            totalCount: initialTotalCount,
          },
    initialArgs: {
      term: initialQuery,
      category: "all",
      baseSpirit: null,
    } satisfies Args,
  });

  // Get base spirit options
  const { options: spiritOptions } = useEnum("spiritType");

  const { reset } = list;
  const search = useCallback(
    (next: RecipeGroupSearchFilters) => {
      void reset(
        {
          term: next.searchTerm,
          category: next.category,
          baseSpirit: next.baseSpirit,
        },
        { clear: true },
      );
    },
    [reset],
  );
  // The debounced run reads the filters as they are when it fires, so a
  // Select changed mid-typing is not undone by the term's late search.
  const latestFilters = useRef(filters);
  latestFilters.current = filters;
  const debouncedSearch = useDebouncedCallback(
    () => search(latestFilters.current),
    300,
  );

  // Handle filter updates
  const handleUpdateFilters = useCallback(
    (updates: Partial<RecipeGroupSearchFilters>) => {
      const next = { ...filters, ...updates };
      setFilters(next);
      // Typing waits 300 ms (the old hook's debounce); a Select applies now.
      if ("searchTerm" in updates) debouncedSearch();
      else search(next);
    },
    [debouncedSearch, filters, search],
  );

  // Handle clear filters
  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    search(DEFAULT_FILTERS);
  }, [search]);

  const results = list.rows;
  const isLoading = list.status !== "idle";
  const hasMore = list.hasNextPage;
  const totalCount = list.totalCount ?? results.length;
  const error = list.failure;

  return (
    <Box>
      {/* Search Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            {/* Main search input */}
            <FormControl>
              <FormLabel>Search Recipe Groups</FormLabel>
              <Input
                placeholder="Search by recipe name, description, or tags..."
                value={filters.searchTerm}
                onChange={(e) =>
                  handleUpdateFilters({ searchTerm: e.target.value })
                }
                startDecorator={<MdSearch />}
                endDecorator={
                  filters.searchTerm && (
                    <Button
                      variant="plain"
                      size="sm"
                      aria-label="Clear search"
                      onClick={() => handleUpdateFilters({ searchTerm: "" })}
                    >
                      <MdClear />
                    </Button>
                  )
                }
              />
            </FormControl>

            {/* Quick filters */}
            <Stack
              direction="row"
              spacing={2}
              flexWrap="wrap"
              alignItems="center"
            >
              <Select
                value={filters.category}
                onChange={(_, value) =>
                  value && handleUpdateFilters({ category: value })
                }
                size="sm"
                sx={{ minWidth: 120 }}
                aria-label="Category"
              >
                <Option value="all">All Categories</Option>
                {CATEGORY_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>

              <Select
                value={filters.baseSpirit || ""}
                onChange={(_, value) =>
                  handleUpdateFilters({ baseSpirit: value || null })
                }
                size="sm"
                sx={{ minWidth: 140 }}
                placeholder="Base Spirit"
                aria-label="Base Spirit"
              >
                <Option value="">Any Spirit</Option>
                {spiritOptions.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>

              {/* Active filters indicator */}
              {(filters.searchTerm ||
                filters.category !== "all" ||
                filters.baseSpirit) && (
                <Button variant="plain" size="sm" onClick={handleClearFilters}>
                  Clear All
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Results */}
      {error && (
        <Typography level="body-md" sx={{ color: "danger.500" }}>
          Error searching recipe groups: {error.message}
        </Typography>
      )}

      {/* Results summary */}
      <Box sx={{ mb: 2 }}>
        <Typography level="body-sm" sx={{ color: "text.secondary" }}>
          {isLoading && results.length === 0
            ? "Searching recipe groups..."
            : results.length > 0
              ? `Found ${totalCount} recipe groups${hasMore ? ` (showing ${results.length})` : ``}`
              : "No recipe groups found"}
        </Typography>
        {hasMore && (
          <Button
            variant="plain"
            size="sm"
            onClick={() => void reset(undefined, { fresh: true })}
            sx={{ ml: 2 }}
          >
            Refresh
          </Button>
        )}
      </Box>

      {/* Recipe group grid */}
      {results.length > 0 ? (
        <VirtualizedRecipeGroupGrid
          recipeGroups={[...results]}
          onRecipeGroupSelect={onRecipeGroupSelect}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={() => void list.loadMore()}
          containerHeight={800}
          itemHeight={350}
          loadingItems={6}
        />
      ) : (
        !isLoading && (
          <Card>
            <CardContent sx={{ textAlign: "center", py: 4 }}>
              <MdRestaurant
                size={48}
                style={{
                  color: "var(--joy-palette-neutral-400)",
                  marginBottom: 16,
                }}
              />
              <Typography level="h4" sx={{ mb: 1 }}>
                No recipe groups found
              </Typography>
              <Typography
                level="body-md"
                sx={{ color: "text.secondary", mb: 2 }}
              >
                Try adjusting your search criteria or filters
              </Typography>
              <Button variant="outlined" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )
      )}
    </Box>
  );
};
