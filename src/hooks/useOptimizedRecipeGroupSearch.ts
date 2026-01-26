import { graphql } from "@cellar-assistant/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "urql";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

// Optimized search query with pagination and caching
const OptimizedRecipeGroupSearchQuery = graphql(`
  query OptimizedRecipeGroupSearch(
    $searchTerm: String!
    $categories: [recipe_category_enum!]!
    $limit: Int!
    $offset: Int!
  ) {
    recipe_groups(
      where: {
        _and: [
          {
            _or: [
              { name: { _ilike: $searchTerm } }
              { description: { _ilike: $searchTerm } }
              { recipes: { name: { _ilike: $searchTerm } } }
            ]
          }
          { category: { _in: $categories } }
        ]
      }
      limit: $limit
      offset: $offset
      order_by: [
        { created_at: desc }
      ]
    ) {
      id
      name
      description
      category
      base_spirit
      tags
      canonical_recipe_id
      canonical_recipe_rel {
        id
        name
        description
        difficulty_level
        prep_time_minutes
        serving_size
        image_url
      }
      recipes_aggregate {
        aggregate {
          count
        }
      }
    }
    recipe_groups_aggregate(
      where: {
        _and: [
          {
            _or: [
              { name: { _ilike: $searchTerm } }
              { description: { _ilike: $searchTerm } }
              { recipes: { name: { _ilike: $searchTerm } } }
            ]
          }
          { category: { _in: $categories } }
        ]
      }
    ) {
      aggregate {
        count
      }
    }
  }
`);

export type RecipeGroupSearchFilters = {
  searchTerm: string;
  category: "all" | "cocktail";
  baseSpirit: string | null;
};

type RecipeCategoryEnum = "cocktail";

export type SearchResult = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  base_spirit?: string | null;
  tags?: string[] | null;
  canonical_recipe_id?: string | null;
  canonical_recipe_rel?: {
    id: string;
    name: string;
    description?: string | null;
    difficulty_level?: number | null;
    prep_time_minutes?: number | null;
    serving_size?: number | null;
    image_url?: string | null;
  } | null;
  recipes_aggregate: {
    aggregate: {
      count: number;
    };
  };
};

export type UseOptimizedRecipeGroupSearchOptions = {
  pageSize?: number;
  debounceMs?: number;
  cacheSize?: number;
  enableInfiniteScroll?: boolean;
};

export type UseOptimizedRecipeGroupSearchResult = {
  results: SearchResult[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
  filters: RecipeGroupSearchFilters;
  updateFilters: (updates: Partial<RecipeGroupSearchFilters>) => void;
  clearFilters: () => void;
};

const DEFAULT_FILTERS: RecipeGroupSearchFilters = {
  searchTerm: "",
  category: "all",
  baseSpirit: null,
};

// Simple LRU cache for search results
class SearchCache {
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 50, ttl = 5 * 60 * 1000) {
    // 5 minute TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: unknown) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

export const useOptimizedRecipeGroupSearch = (
  initialFilters: Partial<RecipeGroupSearchFilters> = {},
  options: UseOptimizedRecipeGroupSearchOptions = {},
): UseOptimizedRecipeGroupSearchResult => {
  const {
    pageSize = 12,
    debounceMs = 300,
    cacheSize = 50,
    enableInfiniteScroll = true,
  } = options;

  const [filters, setFilters] = useState<RecipeGroupSearchFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const [page, setPage] = useState(0);
  const [allResults, setAllResults] = useState<SearchResult[]>([]);

  // Cache ref
  const cacheRef = useRef(new SearchCache(cacheSize));

  // Debounced filter updates
  const debouncedUpdateFilters = useDebouncedCallback(
    (newFilters: RecipeGroupSearchFilters) => {
      setFilters(newFilters);
      setPage(0);
      setAllResults([]);
    },
    debounceMs,
  );

  // Build query variables
  const searchVariables = useMemo(() => {
    const searchTerm = filters.searchTerm ? `%${filters.searchTerm}%` : "%%";
    // Get all recipe categories when "all" is selected, otherwise use selected category
    const categories: RecipeCategoryEnum[] =
      filters.category === "all" ? ["cocktail"] : [filters.category];

    return {
      searchTerm,
      categories,
      limit: pageSize,
      offset: page * pageSize,
    };
  }, [filters, page, pageSize]);

  // Create cache key
  const cacheKey = useMemo(() => {
    return JSON.stringify(searchVariables);
  }, [searchVariables]);

  // Check cache first
  const cachedResult = cacheRef.current.get(cacheKey);

  // Execute query with proper typing
  const [queryResult, refetchQuery] = useQuery({
    query: OptimizedRecipeGroupSearchQuery,
    variables: searchVariables as any, // Temporary type assertion to resolve GraphQL schema mismatch
    pause: !!cachedResult, // Skip query if cached
    requestPolicy: "cache-first",
  });

  // Use cached result or query result
  const result = cachedResult || queryResult;

  // Type guard for query result
  const hasValidData = result && typeof result === "object" && "data" in result;
  const data = hasValidData
    ? (result as { data?: unknown; error?: unknown; fetching?: boolean }).data
    : null;
  const error = hasValidData
    ? (result as { data?: unknown; error?: unknown; fetching?: boolean }).error
    : null;
  const fetching = Boolean(
    hasValidData
      ? (result as { data?: unknown; error?: unknown; fetching?: boolean })
          .fetching
      : false,
  );

  // Cache successful results
  useEffect(() => {
    if (data && !error && !cachedResult) {
      cacheRef.current.set(cacheKey, result);
    }
  }, [data, error, cacheKey, cachedResult, result]);

  // Update results for infinite scroll
  useEffect(() => {
    if (data && typeof data === "object" && "recipe_groups" in data) {
      const newResults = (data as any).recipe_groups || [];

      if (page === 0) {
        // New search - replace all results
        setAllResults(newResults);
      } else {
        // Load more - append results
        setAllResults((prev) => [...prev, ...newResults]);
      }
    }
  }, [data, page]);

  // Calculate derived state
  const totalCount =
    data && typeof data === "object" && "recipe_groups_aggregate" in data
      ? (data as any).recipe_groups_aggregate?.aggregate?.count || 0
      : 0;
  const hasMore = enableInfiniteScroll && allResults.length < totalCount;
  const isLoading = fetching && !cachedResult;

  // Handlers
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore, isLoading]);

  const updateFilters = useCallback(
    (updates: Partial<RecipeGroupSearchFilters>) => {
      const newFilters = { ...filters, ...updates };
      debouncedUpdateFilters(newFilters);
    },
    [filters, debouncedUpdateFilters],
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
    setAllResults([]);
    cacheRef.current.clear();
  }, []);

  const refetch = useCallback(() => {
    cacheRef.current.clear();
    setPage(0);
    setAllResults([]);
    refetchQuery({ requestPolicy: "network-only" });
  }, [refetchQuery]);

  return {
    results: allResults,
    totalCount,
    isLoading,
    error:
      error && typeof error === "object" && "message" in error
        ? new Error((error as any).message)
        : null,
    hasMore,
    loadMore,
    refetch,
    filters,
    updateFilters,
    clearFilters,
  };
};
