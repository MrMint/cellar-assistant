"use client";

import { graphql } from "@cellar-assistant/shared";
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
import { useCallback, useMemo } from "react";
import { MdClear, MdRestaurant, MdSearch } from "react-icons/md";
import { useQuery } from "urql";
import { VirtualizedRecipeGroupGrid } from "@/components/recipe/VirtualizedRecipeGroupGrid";
import {
  type RecipeGroupSearchFilters,
  useOptimizedRecipeGroupSearch,
} from "@/hooks/useOptimizedRecipeGroupSearch";

const _DEFAULT_FILTERS: RecipeGroupSearchFilters = {
  searchTerm: "",
  category: "all",
  baseSpirit: null,
};

// Query for base spirit options
const GetBaseSpiritOptionsQuery = graphql(`
  query GetBaseSpiritOptions {
    __type(name: "spirit_type_enum") {
      enumValues {
        name
        description
      }
    }
  }
`);

export type RecipeGroupSearchProps = {
  initialQuery?: string;
  onRecipeGroupSelect?: (groupId: string) => void;
};

export const RecipeGroupSearch = ({
  initialQuery = "",
  onRecipeGroupSelect,
}: RecipeGroupSearchProps) => {
  // Use the optimized search hook
  const {
    results,
    totalCount,
    isLoading,
    error,
    hasMore,
    loadMore,
    refetch,
    filters,
    updateFilters,
    clearFilters: clearSearchFilters,
  } = useOptimizedRecipeGroupSearch(
    { searchTerm: initialQuery },
    {
      pageSize: 12,
      debounceMs: 300,
      enableInfiniteScroll: true,
    },
  );

  // Get base spirit options
  const [spiritOptionsResult] = useQuery({
    query: GetBaseSpiritOptionsQuery,
  });

  // Build spirit options list
  const spiritOptions = useMemo(() => {
    const typeData = spiritOptionsResult.data?.__type as
      | { enumValues?: Array<{ name: string; description?: string | null }> }
      | undefined;
    if (!typeData?.enumValues) return [];
    return typeData.enumValues.map(
      (option: { name: string; description?: string | null }) => ({
        value: option.name,
        label: option.name
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (l: string) => l.toUpperCase()),
      }),
    );
  }, [spiritOptionsResult.data]);

  // Handle filter updates
  const handleUpdateFilters = useCallback(
    (updates: Partial<RecipeGroupSearchFilters>) => {
      updateFilters(updates);
    },
    [updateFilters],
  );

  // Handle clear filters
  const handleClearFilters = useCallback(() => {
    clearSearchFilters();
  }, [clearSearchFilters]);

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
              >
                <Option value="all">All Categories</Option>
                <Option value="cocktail">Cocktails</Option>
              </Select>

              <Select
                value={filters.baseSpirit || ""}
                onChange={(_, value) =>
                  handleUpdateFilters({ baseSpirit: value || null })
                }
                size="sm"
                sx={{ minWidth: 140 }}
                placeholder="Base Spirit"
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
          <Button variant="plain" size="sm" onClick={refetch} sx={{ ml: 2 }}>
            Refresh
          </Button>
        )}
      </Box>

      {/* Recipe group grid */}
      {results.length > 0 ? (
        <VirtualizedRecipeGroupGrid
          recipeGroups={results}
          onRecipeGroupSelect={onRecipeGroupSelect}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
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
