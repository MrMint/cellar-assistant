"use client";

import { type ReactNode, useCallback, useState } from "react";
import { useQuery } from "urql";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChip } from "@/components/app/FilterChip";
import { Check, ChevronDown, NoResults } from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
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
import { SearchField } from "@/components/shell/SearchField";
import { Button } from "@/components/ui/button";
import type { FragmentOf } from "@/lib/api/graphql";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import {
  RECIPE_SPIRIT_COUNTS_SIZE,
  RecipeBaseSpiritCountsQuery,
  spiritChips,
} from "./recipe-spirit-chips";

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

const categoryLabel = (category: "all" | Category): string =>
  category === "all"
    ? "All kinds"
    : (CATEGORY_OPTIONS.find((option) => option.value === category)?.label ??
      "All kinds");

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
  /**
   * What sits between the search field and All recipes on the index (the bar
   * card, your drafts and recipes). Hidden while a search term is in, when
   * the page is the search's results (Recipes-Browse 08, 09).
   */
  between?: ReactNode;
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
 * Spirit chips are the kinds the groups hold (F-114, H-87):
 * `recipeBaseSpiritCounts` under the same category and term, each with its
 * count — a bar kind ("rye", "gin"), what `recipe_groups.base_spirit` holds
 * and the filter matches (a "Whiskey" chip counts bourbon, rye, Scotch and
 * Irish). Never the whole vocabulary: a kind no recipe has is no chip.
 */
export const RecipeGroupSearch = ({
  initialQuery = "",
  onRecipeGroupSelect,
  initialEdges,
  initialEndCursor = null,
  initialHasNextPage = false,
  initialTotalCount = null,
  between,
}: RecipeGroupSearchProps) => {
  // Clear remounts the (uncontrolled) search field empty.
  const [fieldKey, setFieldKey] = useState(0);
  const [kindsOpen, setKindsOpen] = useState(false);
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
        // The rows stay, dimmed, until the new answer lands (Recipes-Browse 08).
        { clear: false },
      );
    },
    [reset],
  );
  const handleUpdateFilters = useCallback(
    (updates: Partial<RecipeGroupSearchFilters>) => {
      const next = { ...filters, ...updates };
      setFilters(next);
      // The field debounces itself (300 ms); a chip applies now.
      search(next);
    },
    [filters, search],
  );

  const handleClearFilters = useCallback(() => {
    feedback("tick");
    setFilters(DEFAULT_FILTERS);
    setFieldKey((key) => key + 1);
    search(DEFAULT_FILTERS);
  }, [search]);

  const [counts] = useQuery({
    query: RecipeBaseSpiritCountsQuery,
    variables: {
      first: RECIPE_SPIRIT_COUNTS_SIZE,
      category: filters.category === "all" ? null : filters.category,
      term: filters.searchTerm.trim() === "" ? null : filters.searchTerm.trim(),
    },
  });
  const countsConnection = counts.data?.recipeBaseSpiritCounts;
  const spirits = spiritChips(
    countsConnection?.__typename === "RecipeBaseSpiritCountConnection"
      ? countsConnection.edges
      : [],
    filters.baseSpirit,
  );

  const results = list.rows;
  const isLoading = list.status !== "idle";
  const hasMore = list.hasNextPage;
  const totalCount = list.totalCount ?? results.length;
  const error = list.failure;
  const term = filters.searchTerm.trim();
  const filtered = filters.category !== "all" || filters.baseSpirit !== null;
  // Never a fetch limit as a total (CROSS-LOT): "12+" until the API counts.
  const countText =
    list.totalCount === null && hasMore
      ? `${results.length}+`
      : String(totalCount);

  return (
    <div data-slot="recipe-group-search" className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-4 bg-background px-4 py-2">
        <SearchField
          key={fieldKey}
          defaultValue={filters.searchTerm}
          placeholder="Search recipes"
          debounceTimeout={300}
          searching={isLoading && term !== ""}
          onDebounced={(value) => handleUpdateFilters({ searchTerm: value })}
        />
      </div>

      {term === "" && between}

      <section aria-labelledby="all-recipes" className="flex flex-col gap-3">
        <h2
          id="all-recipes"
          className="t-head m-0 flex items-baseline gap-2 text-ink"
          aria-live="polite"
        >
          {term === "" ? "All recipes" : "Results"}
          {!(isLoading && results.length === 0) && (
            <span className="t-cap tabular text-ink-3">{countText}</span>
          )}
        </h2>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <FilterChip
            selected={filters.category !== "all"}
            aria-haspopup="dialog"
            onClick={() => setKindsOpen(true)}
          >
            <span className="inline-flex items-center gap-1">
              {categoryLabel(filters.category)}
              <ChevronDown aria-hidden className="size-4" />
            </span>
          </FilterChip>
          {spirits.map((option) => (
            <FilterChip
              key={option.value}
              selected={filters.baseSpirit === option.value}
              count={option.count}
              onClick={() =>
                handleUpdateFilters({
                  baseSpirit:
                    filters.baseSpirit === option.value ? null : option.value,
                })
              }
            >
              {option.label}
            </FilterChip>
          ))}
        </div>

        {(filtered || term !== "") && (
          <div className="flex min-h-11 items-center justify-between gap-2">
            <p className="t-cap m-0 text-ink-2">
              {isLoading && results.length === 0
                ? "Searching…"
                : totalCount === 1
                  ? "1 recipe"
                  : `${countText} recipes`}
            </p>
            <Button
              variant="ghost"
              className="text-ink-2"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          </div>
        )}

        {error !== null && (
          <p role="alert" className="t-body m-0 text-danger">
            Couldn't search recipes. {error.message}
          </p>
        )}

        {results.length > 0 ? (
          <div className="flex flex-col gap-3">
            <ul
              aria-busy={isLoading || undefined}
              className={cn(
                "m-0 grid list-none grid-cols-1 gap-3 p-0 transition-opacity duration-(--ca-dur-short) md:grid-cols-2",
                // Dim while refining (Recipes-Browse 08): the rows stay put.
                list.status === "resetting" && "opacity-60",
              )}
            >
              {results.map((recipeGroup) => (
                <li key={recipeGroup.id}>
                  <RecipeGroupCard
                    recipeGroup={recipeGroup}
                    href={`/recipes/groups/${recipeGroup.id}`}
                    onClick={onRecipeGroupSelect}
                  />
                </li>
              ))}
              {list.status === "loadingMore" && (
                <RecipeGroupCardSkeleton count={3} />
              )}
            </ul>
            {hasMore && (
              <Button
                variant="outline"
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
          !isLoading &&
          error === null && (
            <EmptyState
              illustration={<NoResults aria-hidden />}
              title={
                term !== ""
                  ? `No recipe matches “${term}”`
                  : filtered
                    ? "No recipe matches"
                    : "No recipes yet"
              }
              action={
                term !== "" || filtered ? (
                  <Button variant="outline" onClick={handleClearFilters}>
                    {term !== "" ? "Clear search" : "Clear filters"}
                  </Button>
                ) : undefined
              }
            />
          )
        )}
      </section>

      <ResponsiveDialog
        open={kindsOpen}
        onOpenChange={setKindsOpen}
        title="Kind"
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {(
            [{ value: "all", label: "All kinds" }, ...CATEGORY_OPTIONS] as const
          ).map((option) => {
            const on = filters.category === option.value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    feedback("detent");
                    setKindsOpen(false);
                    handleUpdateFilters({ category: option.value });
                  }}
                  className="t-body flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left text-ink outline-none active:bg-raised focus-visible:outline-2 focus-visible:outline-act-ink"
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {on && <Check aria-hidden className="size-5 text-act-ink" />}
                </button>
              </li>
            );
          })}
        </ul>
      </ResponsiveDialog>
    </div>
  );
};
