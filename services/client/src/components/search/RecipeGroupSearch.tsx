"use client";

import {
  BASE_SPIRIT_KINDS,
  barKindLabel,
} from "@cellar-assistant/contracts/bar";
import { useCallback, useId, useRef, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Close, Restaurant, Search } from "@/components/app/icons";
import {
  type RecipeGroupCardData,
  recipeGroupCardFromNode,
} from "@/components/recipe/adapter";
import { RecipeGroupCardFragment } from "@/components/recipe/fragments";
import {
  RECIPE_GROUPS_PAGE_SIZE,
  RecipeGroupsQuery,
} from "@/components/recipe/queries";
import { RecipeGroupCard } from "@/components/recipe/RecipeGroupCard";
import { RecipeGroupCardSkeleton } from "@/components/recipe/RecipeGroupCardSkeleton";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
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

/** Radix Select reserves `""` for "no value", so "Any Spirit" needs a name. */
const ANY_SPIRIT = "any";

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
 * search card (one box, category and base-spirit Selects, "Clear"), the
 * results line, and the cards.
 *
 * X15 dropped the old nested virtualizer: an 800 px scroll box *inside* the
 * app's own scroller, which sliced the last card in half and hid the end of
 * the list (review #58). The cards are a plain grid in the page's scroll now,
 * with "Show more" for the next page — twelve cards a page does not need
 * windowing, and the page's own scroll is the one the thumb expects.
 *
 * `useOptimizedRecipeGroupSearch` (Hasura `_ilike`, offset paging, an LRU) →
 * `recipeGroups(term:, category:, baseSpirit:)` through `usePagedConnection`:
 * cursor paging, a real `totalCount`, and only the newest answer lands. Two
 * old filters that never reached the query now do — the base spirit (the old
 * hook dropped it) and every category (it hard-coded `cocktail`). The term
 * is G26: the old box's name / description / version-name substring.
 *
 * Spirit options are the bar vocabulary's spirits (`BASE_SPIRIT_KINDS`, X14):
 * `recipe_groups.base_spirit` holds a bar kind ("rye", "gin") — what the
 * recipe-photo job and `backfill-recipes` write — and the filter matches it
 * (a "Whiskey" filter includes bourbon, rye, Scotch and Irish). The
 * `referenceData(SPIRIT_TYPE)` names this used to offer ("GIN", "BOURBON")
 * are a bottle's type, and never matched a stored value.
 */
const SPIRIT_OPTIONS = BASE_SPIRIT_KINDS.map((kind) => ({
  value: kind,
  label: barKindLabel(kind) ?? kind,
}));

export const RecipeGroupSearch = ({
  initialQuery = "",
  onRecipeGroupSelect,
  initialEdges,
  initialEndCursor = null,
  initialHasNextPage = false,
  initialTotalCount = null,
}: RecipeGroupSearchProps) => {
  const searchId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    <div>
      {/* Search Header */}
      <section className="mb-6 flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        {/* Main search input */}
        <Field>
          <FieldLabel htmlFor={searchId} className="sr-only">
            Search recipes
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchInputRef}
              id={searchId}
              type="search"
              enterKeyHint="search"
              placeholder="Search recipes"
              value={filters.searchTerm}
              onChange={(e) =>
                handleUpdateFilters({ searchTerm: e.target.value })
              }
            />
            {filters.searchTerm && (
              <InputGroupAddon align="inline-end">
                {/* 32 px drawn inside the 44 px field; the pseudo-element
                    keeps the target at 44. The button unmounts once the term
                    is empty, so focus goes back to the field, not <body>. */}
                <InputGroupButton
                  size="icon-sm"
                  aria-label="Clear search"
                  className="relative after:absolute after:-inset-1.5 after:content-['']"
                  onClick={() => {
                    handleUpdateFilters({ searchTerm: "" });
                    searchInputRef.current?.focus();
                  }}
                >
                  <Close aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </Field>

        {/* Quick filters */}
        <div className="flex flex-wrap items-center gap-4">
          <Select
            value={filters.category}
            onValueChange={(value) =>
              handleUpdateFilters({ category: value as "all" | Category })
            }
          >
            <SelectTrigger aria-label="Category" className="min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.baseSpirit ?? ANY_SPIRIT}
            onValueChange={(value) =>
              handleUpdateFilters({
                baseSpirit: value === ANY_SPIRIT ? null : value,
              })
            }
          >
            <SelectTrigger aria-label="Base Spirit" className="min-w-[140px]">
              <SelectValue placeholder="Base Spirit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_SPIRIT}>Any Spirit</SelectItem>
              {SPIRIT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Active filters indicator */}
          {(filters.searchTerm ||
            filters.category !== "all" ||
            filters.baseSpirit) && (
            <Button variant="ghost" onClick={handleClearFilters}>
              Clear
            </Button>
          )}
        </div>
      </section>

      {/* Results */}
      {error && (
        <p className="type-body text-destructive">
          Couldn't search recipes: {error.message}
        </p>
      )}

      {/* Results summary */}
      <p className="mb-4 px-1 type-footnote" aria-live="polite">
        {isLoading && results.length === 0
          ? "Searching…"
          : results.length > 0
            ? hasMore
              ? `Showing ${results.length} of ${totalCount}`
              : totalCount === 1
                ? "1 recipe"
                : `${totalCount} recipes`
            : ""}
      </p>

      {results.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {results.map((recipeGroup) => (
              <RecipeGroupCard
                key={recipeGroup.id}
                recipeGroup={recipeGroup}
                href={`/recipes/groups/${recipeGroup.id}`}
                onClick={onRecipeGroupSelect}
              />
            ))}
            {list.status === "loadingMore" && (
              <RecipeGroupCardSkeleton count={3} />
            )}
          </div>
          {hasMore && (
            <Button
              variant="secondary"
              className="self-center"
              disabled={list.status === "loadingMore"}
              aria-busy={list.status === "loadingMore" || undefined}
              onClick={() => void list.loadMore()}
            >
              Show more
            </Button>
          )}
        </div>
      ) : (
        !isLoading && (
          <EmptyState
            className="rounded-lg bg-surface-1"
            illustration={<Restaurant aria-hidden />}
            title="No recipes found"
            description="Try another word, or clear the filters."
            action={
              <Button variant="outline" onClick={handleClearFilters}>
                Clear filters
              </Button>
            }
          />
        )
      )}
    </div>
  );
};
