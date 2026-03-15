"use client";

import { Box, Stack } from "@mui/joy";
import { useRouter, useSearchParams } from "next/navigation";
import { ascend, isNotNil, sortWith } from "ramda";
import { useCallback, useMemo, useState } from "react";
import { HeaderBar } from "@/components/common/HeaderBar";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import type { RecipeSearchResult } from "@/lib/recipe-search";
import { RecipeCard, type RecipeCardItem } from "./RecipeCard";

interface RecipesListClientProps {
  userId: string;
  initialRecipes: RecipeSearchResult[];
  initialSearch: string;
  isSemanticSearch: boolean;
}

export const RecipesListClient = ({
  initialRecipes,
  initialSearch,
}: RecipesListClientProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearchState] = useState(initialSearch);
  const [isSearching, setIsSearching] = useState(false);

  // Transform initial recipes to RecipeCardItem format
  const recipeItems: RecipeCardItem[] = initialRecipes
    .map((recipe: RecipeSearchResult) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      type: recipe.type,
      difficulty_level: recipe.difficulty_level,
      prep_time_minutes: recipe.prep_time_minutes,
      serving_size: recipe.serving_size,
      image_url: recipe.image_url,
      ingredient_count: recipe.ingredient_count,
    }))
    .filter(isNotNil);

  // Handle search with URL updates
  const handleSearchChange = useCallback(
    (newSearch: string) => {
      setSearchState(newSearch);
      setIsSearching(true);

      const params = new URLSearchParams(searchParams.toString());

      if (newSearch.trim()) {
        // Use semantic search for longer, natural language queries
        if (newSearch.length > 20) {
          params.set("semantic", newSearch);
          params.delete("q");
        } else {
          params.set("q", newSearch);
          params.delete("semantic");
        }
      } else {
        params.delete("q");
        params.delete("semantic");
      }

      router.push(`/recipes?${params.toString()}`);
    },
    [router, searchParams],
  );

  const filteredRecipes = recipeItems;

  const sortedRecipes = useMemo(
    () => sortWith([ascend((x: RecipeCardItem) => x.name)], filteredRecipes),
    [filteredRecipes],
  );

  return (
    <Box>
      <Stack spacing={2}>
        <HeaderBar
          defaultSearchValue={search}
          onSearchChange={handleSearchChange}
          isSearching={isSearching}
        />
        <VirtualGrid
          items={sortedRecipes}
          cacheKey={`recipes-${search}`}
          getItemKey={(recipe) => recipe.id}
          gridBreakpoints={{ xs: filteredRecipes.length > 6 ? 6 : 12, sm: 6, md: 4, lg: 3, xl: 2 }}
          emptyMessage="No recipes found"
          renderItem={(recipe, onBeforeNavigate) => (
            <Box onClick={onBeforeNavigate}>
              <RecipeCard recipe={recipe} href={`/recipes/${recipe.id}`} />
            </Box>
          )}
        />
      </Stack>
    </Box>
  );
};
