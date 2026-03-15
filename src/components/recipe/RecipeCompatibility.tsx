"use client";

import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import { isNotNil } from "ramda";
import {
  MdCheckCircle,
  MdError,
  MdShoppingCart,
  MdSwapHoriz,
  MdWarning,
} from "react-icons/md";
import { useRecipeCompatibility } from "@/hooks/useRecipeCompatibility";
import type { RecipeCompatibility as RecipeCompatibilityType } from "@/lib/recipe-compatibility";

const getScoreColor = (score: number) => {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
};

const getScoreText = (score: number) => {
  if (score >= 90) return "Perfect Match";
  if (score >= 80) return "Great Match";
  if (score >= 60) return "Good Match";
  if (score >= 40) return "Partial Match";
  return "Poor Match";
};

export type RecipeCompatibilityProps = {
  recipeId: string;
  userId?: string;
  showDetails?: boolean;
  showShoppingList?: boolean;
  compact?: boolean;
};

export const RecipeCompatibility = ({
  recipeId,
  userId,
  showDetails = true,
  showShoppingList = false,
  compact = false,
}: RecipeCompatibilityProps) => {
  const { compatibility, isLoading, error } = useRecipeCompatibility(recipeId, {
    userId,
    includeShoppingList: showShoppingList,
    enabled: isNotNil(userId),
  });

  if (!userId) {
    return (
      <Card variant="outlined" size="sm">
        <CardContent>
          <Typography level="body-sm" sx={{ color: "text.secondary" }}>
            Sign in to see recipe compatibility with your cellar
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card variant="outlined" size="sm">
        <CardContent>
          <Typography level="body-sm">Analyzing compatibility...</Typography>
          <LinearProgress sx={{ mt: 1 }} />
        </CardContent>
      </Card>
    );
  }

  if (error || !compatibility) {
    return (
      <Card variant="outlined" size="sm">
        <CardContent>
          <Typography level="body-sm" sx={{ color: "danger.500" }}>
            Unable to analyze compatibility
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return <CompactCompatibilityDisplay compatibility={compatibility} />;
  }

  return (
    <DetailedCompatibilityDisplay
      compatibility={compatibility}
      showDetails={showDetails}
      showShoppingList={showShoppingList}
    />
  );
};

type CompactCompatibilityDisplayProps = {
  compatibility: RecipeCompatibilityType;
};

const CompactCompatibilityDisplay = ({
  compatibility,
}: CompactCompatibilityDisplayProps) => {
  const scoreColor = getScoreColor(compatibility.overall_score);
  const scoreText = getScoreText(compatibility.overall_score);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Chip
        variant="soft"
        color={scoreColor}
        size="sm"
        startDecorator={
          compatibility.can_make ? (
            <MdCheckCircle />
          ) : compatibility.required_missing_count > 0 ? (
            <MdError />
          ) : (
            <MdWarning />
          )
        }
      >
        {compatibility.overall_score}% {scoreText}
      </Chip>

      {!compatibility.can_make && compatibility.required_missing_count > 0 && (
        <Typography level="body-xs" sx={{ color: "text.secondary" }}>
          Missing {compatibility.required_missing_count} ingredients
        </Typography>
      )}
    </Box>
  );
};

type DetailedCompatibilityDisplayProps = {
  compatibility: RecipeCompatibilityType;
  showDetails: boolean;
  showShoppingList: boolean;
};

const DetailedCompatibilityDisplay = ({
  compatibility,
  showDetails,
  showShoppingList,
}: DetailedCompatibilityDisplayProps) => {
  const scoreColor = getScoreColor(compatibility.overall_score);
  const scoreText = getScoreText(compatibility.overall_score);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          {/* Header with score */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography level="title-md">Cellar Compatibility</Typography>
            <Chip
              variant="soft"
              color={scoreColor}
              startDecorator={
                compatibility.can_make ? (
                  <MdCheckCircle />
                ) : compatibility.required_missing_count > 0 ? (
                  <MdError />
                ) : (
                  <MdWarning />
                )
              }
            >
              {compatibility.overall_score}% {scoreText}
            </Chip>
          </Box>

          {/* Progress bar */}
          <Box>
            <LinearProgress
              determinate
              value={compatibility.overall_score}
              color={scoreColor}
              sx={{ height: 8, borderRadius: "sm" }}
            />
          </Box>

          {/* Can make status */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {compatibility.can_make ? (
              <>
                <MdCheckCircle
                  style={{ color: "var(--joy-palette-success-500)" }}
                />
                <Typography level="body-md" sx={{ color: "success.500" }}>
                  You can make this recipe!
                </Typography>
              </>
            ) : (
              <>
                <MdError style={{ color: "var(--joy-palette-danger-500)" }} />
                <Typography level="body-md" sx={{ color: "danger.500" }}>
                  Missing {compatibility.required_missing_count} required
                  ingredients
                </Typography>
              </>
            )}
          </Box>

          {/* Summary stats */}
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Box>
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                Available
              </Typography>
              <Typography level="title-sm" sx={{ color: "success.500" }}>
                {compatibility.available_ingredients.length}
              </Typography>
            </Box>

            <Box>
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                Missing
              </Typography>
              <Typography level="title-sm" sx={{ color: "danger.500" }}>
                {compatibility.missing_ingredients.length}
              </Typography>
            </Box>

            {compatibility.substitution_suggestions.length > 0 && (
              <Box>
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  Substitutions
                </Typography>
                <Typography level="title-sm" sx={{ color: "warning.500" }}>
                  {compatibility.substitution_suggestions.length}
                </Typography>
              </Box>
            )}
          </Stack>

          {showDetails && (
            <>
              <Divider />

              {/* Available ingredients */}
              {compatibility.available_ingredients.length > 0 && (
                <Box>
                  <Typography
                    level="title-sm"
                    sx={{ mb: 1, color: "success.500" }}
                  >
                    Available in Your Cellar
                  </Typography>
                  <Stack spacing={1}>
                    {compatibility.available_ingredients
                      .slice(0, 5)
                      .map((match) => (
                        <Box
                          key={match.ingredient_id}
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <MdCheckCircle
                            size={16}
                            style={{ color: "var(--joy-palette-success-500)" }}
                          />
                          <Typography level="body-sm">
                            {match.matched_item
                              ? getCellarItemName(match.matched_item)
                              : "Available"}
                          </Typography>
                          {match.match_type !== "exact" && (
                            <Chip variant="outlined" size="sm">
                              {match.match_type}
                            </Chip>
                          )}
                        </Box>
                      ))}
                    {compatibility.available_ingredients.length > 5 && (
                      <Typography
                        level="body-xs"
                        sx={{ color: "text.secondary" }}
                      >
                        +{compatibility.available_ingredients.length - 5} more
                        available
                      </Typography>
                    )}
                  </Stack>
                </Box>
              )}

              {/* Substitution suggestions */}
              {compatibility.substitution_suggestions.length > 0 && (
                <Box>
                  <Typography
                    level="title-sm"
                    sx={{ mb: 1, color: "warning.500" }}
                  >
                    <MdSwapHoriz
                      style={{ verticalAlign: "middle", marginRight: 4 }}
                    />
                    Suggested Substitutions
                  </Typography>
                  <Stack spacing={1}>
                    {compatibility.substitution_suggestions
                      .slice(0, 3)
                      .map((match) => (
                        <Box
                          key={match.ingredient_id}
                          sx={{
                            p: 1,
                            bgcolor: "warning.50",
                            borderRadius: "sm",
                          }}
                        >
                          <Typography level="body-sm" fontWeight="md">
                            {match.matched_item
                              ? getCellarItemName(match.matched_item)
                              : "Substitute"}
                          </Typography>
                          {match.substitution_reason && (
                            <Typography
                              level="body-xs"
                              sx={{ color: "text.secondary" }}
                            >
                              {match.substitution_reason}
                            </Typography>
                          )}
                        </Box>
                      ))}
                  </Stack>
                </Box>
              )}

              {/* Missing ingredients */}
              {compatibility.missing_ingredients.length > 0 && (
                <Box>
                  <Typography
                    level="title-sm"
                    sx={{ mb: 1, color: "danger.500" }}
                  >
                    Missing Ingredients
                  </Typography>
                  <Stack spacing={1}>
                    {compatibility.missing_ingredients
                      .slice(0, 3)
                      .map((match) => (
                        <Box
                          key={match.ingredient_id}
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <MdError
                            size={16}
                            style={{ color: "var(--joy-palette-danger-500)" }}
                          />
                          <Typography level="body-sm">
                            Missing ingredient
                          </Typography>
                          {match.is_optional && (
                            <Chip variant="outlined" size="sm" color="neutral">
                              Optional
                            </Chip>
                          )}
                        </Box>
                      ))}
                  </Stack>
                </Box>
              )}
            </>
          )}

          {/* Shopping list */}
          {showShoppingList &&
            compatibility.shopping_list &&
            compatibility.shopping_list.length > 0 && (
              <>
                <Divider />
                <Box>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    <MdShoppingCart
                      style={{ verticalAlign: "middle", marginRight: 4 }}
                    />
                    Shopping List
                  </Typography>
                  <Stack spacing={1}>
                    {compatibility.shopping_list.map((item) => (
                      <Box
                        key={item.ingredient_id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Box>
                          <Typography
                            level="body-sm"
                            fontWeight={item.is_essential ? "md" : "normal"}
                          >
                            {item.name}
                          </Typography>
                          {item.estimated_quantity && (
                            <Typography
                              level="body-xs"
                              sx={{ color: "text.secondary" }}
                            >
                              {item.estimated_quantity}
                            </Typography>
                          )}
                        </Box>
                        <Chip
                          variant="outlined"
                          size="sm"
                          color={item.is_essential ? "danger" : "neutral"}
                        >
                          {item.category}
                        </Chip>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </>
            )}
        </Stack>
      </CardContent>
    </Card>
  );
};

// Helper function to get cellar item name
function getCellarItemName(cellarItem: {
  wine?: { name: string } | null;
  beer?: { name: string } | null;
  spirit?: { name: string } | null;
  coffee?: { name: string } | null;
}): string {
  if (cellarItem.wine) return cellarItem.wine.name;
  if (cellarItem.beer) return cellarItem.beer.name;
  if (cellarItem.spirit) return cellarItem.spirit.name;
  if (cellarItem.coffee) return cellarItem.coffee.name;
  return "Unknown item";
}
