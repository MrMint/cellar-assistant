"use client";

import { graphql } from "@cellar-assistant/shared";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  Input,
  Option,
  Select,
  Slider,
  Stack,
  Typography,
} from "@mui/joy";
import { isNotNil } from "ramda";
import { useCallback, useMemo, useState } from "react";
import { MdClear, MdRestaurant, MdSearch, MdTune } from "react-icons/md";
import { useQuery } from "urql";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useMultipleRecipeCompatibility } from "@/hooks/useRecipeCompatibility";

// Search filters interface
export type RecipeSearchFilters = {
  searchTerm: string;
  recipeType: "all" | "cocktail";
  difficultyRange: [number, number];
  prepTimeMax: number | null;
  servingSize: number | null;
  availableIngredientsOnly: boolean;
  minCompatibilityScore: number;
  ingredientIncludes: string[];
  ingredientExcludes: string[];
};

const DEFAULT_FILTERS: RecipeSearchFilters = {
  searchTerm: "",
  recipeType: "all",
  difficultyRange: [1, 5],
  prepTimeMax: null,
  servingSize: null,
  availableIngredientsOnly: false,
  minCompatibilityScore: 0,
  ingredientIncludes: [],
  ingredientExcludes: [],
};

// GraphQL query for advanced recipe search
const SearchRecipesQuery = graphql(`
  query SearchRecipes(
    $searchTerm: String!
    $recipeTypes: [String!]!
    $difficultyMin: Int!
    $difficultyMax: Int!
    $prepTimeMax: Int
    $servingSize: Int
    $limit: Int!
    $offset: Int!
  ) {
    recipes(
      where: {
        _and: [
          {
            _or: [
              { name: { _ilike: $searchTerm } }
              { description: { _ilike: $searchTerm } }
              { 
                recipe_ingredients: { 
                  _or: [
                    { wine: { name: { _ilike: $searchTerm } } }
                    { beer: { name: { _ilike: $searchTerm } } }
                    { spirit: { name: { _ilike: $searchTerm } } }
                    { coffee: { name: { _ilike: $searchTerm } } }
                    { generic_item: { name: { _ilike: $searchTerm } } }
                  ]
                }
              }
            ]
          }
          { type: { _in: $recipeTypes } }
          { difficulty_level: { _gte: $difficultyMin, _lte: $difficultyMax } }
          { prep_time_minutes: { _lte: $prepTimeMax } }
          { serving_size: { _eq: $servingSize } }
        ]
      }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      type
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      ingredients: recipe_ingredients {
        id
        quantity
        unit
        is_optional
        substitution_notes
        wine_id
        beer_id
        spirit_id
        coffee_id
        generic_item_id
        wine {
          id
          name
          vintage
          style
        }
        beer {
          id
          name
          style
        }
        spirit {
          id
          name
          type
        }
        coffee {
          id
          name
          roast_level
        }
        generic_item {
          id
          name
          category
          subcategory
          item_type
        }
      }
    }
    recipes_aggregate(
      where: {
        _and: [
          {
            _or: [
              { name: { _ilike: $searchTerm } }
              { description: { _ilike: $searchTerm } }
              { 
                recipe_ingredients: { 
                  _or: [
                    { wine: { name: { _ilike: $searchTerm } } }
                    { beer: { name: { _ilike: $searchTerm } } }
                    { spirit: { name: { _ilike: $searchTerm } } }
                    { coffee: { name: { _ilike: $searchTerm } } }
                    { generic_item: { name: { _ilike: $searchTerm } } }
                  ]
                }
              }
            ]
          }
          { type: { _in: $recipeTypes } }
          { difficulty_level: { _gte: $difficultyMin, _lte: $difficultyMax } }
          { prep_time_minutes: { _lte: $prepTimeMax } }
          { serving_size: { _eq: $servingSize } }
        ]
      }
    ) {
      aggregate {
        count
      }
    }
  }
`);

// Query for ingredient suggestions
const GetIngredientSuggestionsQuery = graphql(`
  query GetIngredientSuggestions($searchTerm: String!) {
    wines: wines(
      where: { name: { _ilike: $searchTerm } }
      limit: 5
    ) {
      id
      name
      type: __typename
    }
    beers: beers(
      where: { name: { _ilike: $searchTerm } }
      limit: 5
    ) {
      id
      name
      type: __typename
    }
    spirits: spirits(
      where: { name: { _ilike: $searchTerm } }
      limit: 5
    ) {
      id
      name
      type: __typename
    }
    coffees: coffees(
      where: { name: { _ilike: $searchTerm } }
      limit: 5
    ) {
      id
      name
      type: __typename
    }
    generic_items(
      where: { name: { _ilike: $searchTerm } }
      limit: 5
    ) {
      id
      name
      category
      type: __typename
    }
  }
`);

export type RecipeSearchProps = {
  userId?: string;
  initialFilters?: Partial<RecipeSearchFilters>;
  onRecipeSelect?: (recipeId: string) => void;
  showCompatibility?: boolean;
};

export const RecipeSearch = ({
  userId,
  initialFilters = {},
  onRecipeSelect,
  showCompatibility = true,
}: RecipeSearchProps) => {
  const [filters, setFilters] = useState<RecipeSearchFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [ingredientSearchTerm, setIngredientSearchTerm] = useState("");

  const pageSize = 12;

  // Debounced search to avoid too many queries
  const debouncedSearch = useDebouncedCallback(
    (newFilters: RecipeSearchFilters) => {
      setFilters(newFilters);
      setPage(0);
    },
    300,
  );

  // Build search variables
  const searchVariables = useMemo(() => {
    const searchTerm = filters.searchTerm ? `%${filters.searchTerm}%` : "%%";
    const recipeTypes =
      filters.recipeType === "all" ? ["cocktail"] : [filters.recipeType];

    return {
      searchTerm,
      recipeTypes,
      difficultyMin: filters.difficultyRange[0],
      difficultyMax: filters.difficultyRange[1],
      prepTimeMax: filters.prepTimeMax,
      servingSize: filters.servingSize,
      limit: pageSize,
      offset: page * pageSize,
    };
  }, [filters, page]);

  // Execute search query
  const [searchResult] = useQuery({
    query: SearchRecipesQuery,
    variables: searchVariables,
  });

  // Get ingredient suggestions for autocomplete
  const [ingredientSuggestionsResult] = useQuery({
    query: GetIngredientSuggestionsQuery,
    variables: {
      searchTerm: ingredientSearchTerm ? `%${ingredientSearchTerm}%` : "%",
    },
    pause: !ingredientSearchTerm,
  });

  // Get compatibility scores for results
  const recipeIds = searchResult.data?.recipes?.map((r) => r.id) || [];
  const { compatibilities } = useMultipleRecipeCompatibility(recipeIds, {
    userId,
    enabled: showCompatibility && isNotNil(userId) && recipeIds.length > 0,
  });

  // Filter recipes by compatibility if needed
  const filteredRecipes = useMemo(() => {
    if (!searchResult.data?.recipes) return [];

    let recipes = searchResult.data.recipes;

    // Filter by compatibility score
    if (showCompatibility && userId && filters.minCompatibilityScore > 0) {
      recipes = recipes.filter((recipe) => {
        const compatibility = compatibilities[recipe.id];
        return (
          compatibility &&
          compatibility.overall_score >= filters.minCompatibilityScore
        );
      });
    }

    // Filter by available ingredients only
    if (filters.availableIngredientsOnly && showCompatibility && userId) {
      recipes = recipes.filter((recipe) => {
        const compatibility = compatibilities[recipe.id];
        return compatibility?.can_make;
      });
    }

    return recipes;
  }, [searchResult.data, compatibilities, filters, showCompatibility, userId]);

  // Build ingredient suggestions list
  const ingredientSuggestions = useMemo(() => {
    if (!ingredientSuggestionsResult.data) return [];

    const suggestions: Array<{
      id: string;
      name: string;
      type: string;
      category?: string;
    }> = [];

    // Add all item types to suggestions
    ["wines", "beers", "spirits", "coffees", "generic_items"].forEach(
      (type) => {
        const items = (ingredientSuggestionsResult.data as any)[type] || [];
        suggestions.push(
          ...items.map((item: any) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            category: item.category,
          })),
        );
      },
    );

    return suggestions;
  }, [ingredientSuggestionsResult.data]);

  // Update filters
  const updateFilters = useCallback(
    (updates: Partial<RecipeSearchFilters>) => {
      const newFilters = { ...filters, ...updates };
      debouncedSearch(newFilters);
    },
    [filters, debouncedSearch],
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
  }, []);

  return (
    <Box>
      {/* Search Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            {/* Main search input */}
            <FormControl>
              <FormLabel>Search Recipes</FormLabel>
              <Input
                placeholder="Search by recipe name, description, or ingredients..."
                value={filters.searchTerm}
                onChange={(e) => updateFilters({ searchTerm: e.target.value })}
                startDecorator={<MdSearch />}
                endDecorator={
                  filters.searchTerm && (
                    <Button
                      variant="plain"
                      size="sm"
                      onClick={() => updateFilters({ searchTerm: "" })}
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
                value={filters.recipeType}
                onChange={(_, value) =>
                  value && updateFilters({ recipeType: value })
                }
                size="sm"
                sx={{ minWidth: 120 }}
              >
                <Option value="all">All Types</Option>
                <Option value="food">Food</Option>
                <Option value="cocktail">Cocktails</Option>
              </Select>

              {showCompatibility && userId && (
                <>
                  <Chip
                    variant={
                      filters.availableIngredientsOnly ? "solid" : "outlined"
                    }
                    color={
                      filters.availableIngredientsOnly ? "success" : "neutral"
                    }
                    onClick={() =>
                      updateFilters({
                        availableIngredientsOnly:
                          !filters.availableIngredientsOnly,
                      })
                    }
                  >
                    Can Make Now
                  </Chip>

                  <FormControl orientation="horizontal" size="sm">
                    <FormLabel sx={{ minWidth: "max-content" }}>
                      Min Score:
                    </FormLabel>
                    <Select
                      value={filters.minCompatibilityScore}
                      onChange={(_, value) =>
                        value !== null &&
                        updateFilters({ minCompatibilityScore: value })
                      }
                      sx={{ minWidth: 80 }}
                    >
                      <Option value={0}>Any</Option>
                      <Option value={50}>50%+</Option>
                      <Option value={70}>70%+</Option>
                      <Option value={80}>80%+</Option>
                      <Option value={90}>90%+</Option>
                    </Select>
                  </FormControl>
                </>
              )}

              <Button
                variant={showAdvancedFilters ? "solid" : "outlined"}
                size="sm"
                startDecorator={<MdTune />}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                Advanced
              </Button>

              {/* Active filters indicator */}
              {(filters.searchTerm ||
                filters.recipeType !== "all" ||
                filters.availableIngredientsOnly ||
                filters.minCompatibilityScore > 0) && (
                <Button variant="plain" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
              )}
            </Stack>

            {/* Advanced filters */}
            {showAdvancedFilters && (
              <>
                <Divider />
                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Difficulty Level</FormLabel>
                      <Slider
                        value={filters.difficultyRange}
                        onChange={(_, value) =>
                          Array.isArray(value) &&
                          updateFilters({
                            difficultyRange: value as [number, number],
                          })
                        }
                        min={1}
                        max={5}
                        step={1}
                        marks={[
                          { value: 1, label: "1" },
                          { value: 3, label: "3" },
                          { value: 5, label: "5" },
                        ]}
                        valueLabelDisplay="auto"
                      />
                    </FormControl>
                  </Grid>

                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Max Prep Time (minutes)</FormLabel>
                      <Input
                        type="number"
                        value={filters.prepTimeMax || ""}
                        onChange={(e) =>
                          updateFilters({
                            prepTimeMax: e.target.value
                              ? parseInt(e.target.value, 10)
                              : null,
                          })
                        }
                        placeholder="Any"
                      />
                    </FormControl>
                  </Grid>

                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Serving Size</FormLabel>
                      <Input
                        type="number"
                        value={filters.servingSize || ""}
                        onChange={(e) =>
                          updateFilters({
                            servingSize: e.target.value
                              ? parseInt(e.target.value, 10)
                              : null,
                          })
                        }
                        placeholder="Any"
                      />
                    </FormControl>
                  </Grid>

                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Must Include Ingredients</FormLabel>
                      <Autocomplete
                        multiple
                        options={ingredientSuggestions}
                        getOptionLabel={(option) => option.name}
                        value={
                          filters.ingredientIncludes
                            .map((id) =>
                              ingredientSuggestions.find((s) => s.id === id),
                            )
                            .filter(Boolean) as any[]
                        }
                        onChange={(_, value) =>
                          updateFilters({
                            ingredientIncludes: value.map((v) => v.id),
                          })
                        }
                        inputValue={ingredientSearchTerm}
                        onInputChange={(_, value) =>
                          setIngredientSearchTerm(value)
                        }
                        placeholder="Start typing ingredient names..."
                        renderTags={(tags, getTagProps) =>
                          tags.map((option, index) => (
                            <Chip {...getTagProps({ index })} key={option.id}>
                              {option.name}
                            </Chip>
                          ))
                        }
                      />
                    </FormControl>
                  </Grid>
                </Grid>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Results */}
      {searchResult.fetching && (
        <Typography level="body-md">Searching recipes...</Typography>
      )}

      {searchResult.error && (
        <Typography level="body-md" sx={{ color: "danger.500" }}>
          Error searching recipes. Please try again.
        </Typography>
      )}

      {searchResult.data && (
        <>
          {/* Results summary */}
          <Box sx={{ mb: 2 }}>
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              Found {filteredRecipes.length} recipes
              {(searchResult.data.recipes_aggregate.aggregate?.count || 0) >
                filteredRecipes.length &&
                ` (${searchResult.data.recipes_aggregate.aggregate?.count || 0} total, filtered by compatibility)`}
            </Typography>
          </Box>

          {/* Recipe grid */}
          {filteredRecipes.length > 0 ? (
            <Grid container spacing={2}>
              {filteredRecipes.map((recipe) => (
                <Grid key={recipe.id} xs={12} sm={6} md={4}>
                  <RecipeCard
                    recipe={{
                      id: recipe.id,
                      name: recipe.name,
                      description: recipe.description,
                      type: recipe.type as "cocktail",
                      difficulty_level: recipe.difficulty_level,
                      prep_time_minutes: recipe.prep_time_minutes,
                      serving_size: recipe.serving_size,
                      image_url: recipe.image_url,
                      ingredient_count: (recipe.ingredients as unknown[])
                        .length,
                      compatibility_score:
                        compatibilities[recipe.id]?.overall_score,
                    }}
                    href={`/recipes/${recipe.id}`}
                    onClick={onRecipeSelect}
                    showCompatibility={showCompatibility}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
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
                  No recipes found
                </Typography>
                <Typography
                  level="body-md"
                  sx={{ color: "text.secondary", mb: 2 }}
                >
                  Try adjusting your search criteria or filters
                </Typography>
                <Button variant="outlined" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {(searchResult.data.recipes_aggregate.aggregate?.count ?? 0) >
            pageSize && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Typography level="body-md" sx={{ px: 2, py: 1 }}>
                  Page {page + 1} of{" "}
                  {Math.ceil(
                    (searchResult.data.recipes_aggregate.aggregate?.count ??
                      0) / pageSize,
                  )}
                </Typography>
                <Button
                  variant="outlined"
                  disabled={
                    (page + 1) * pageSize >=
                    (searchResult.data.recipes_aggregate.aggregate?.count ?? 0)
                  }
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};
