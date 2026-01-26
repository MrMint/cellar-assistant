"use client";

import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import { MdRestaurant } from "react-icons/md";
import { Link } from "@/components/common/Link";
import beer1 from "@/images/beer1.png";
import wine1 from "@/images/wine1.png";

const getDifficultyColor = (level: number) => {
  if (level <= 2) return "success";
  if (level <= 3) return "warning";
  return "danger";
};

const getDifficultyText = (level: number) => {
  if (level === 1) return "Very Easy";
  if (level === 2) return "Easy";
  if (level === 3) return "Medium";
  if (level === 4) return "Hard";
  return "Very Hard";
};

const getFallback = (type: string) => {
  return type === "food"
    ? { image: beer1, alt: "A food dish" }
    : { image: wine1, alt: "A cocktail" };
};

const formatQuantity = (quantity?: number | null, unit?: string | null) => {
  if (isNil(quantity)) return "";

  let formatted = quantity.toString();

  // Convert decimals to fractions for common cooking measurements
  if (quantity % 1 !== 0) {
    const decimal = quantity % 1;
    const whole = Math.floor(quantity);

    if (decimal === 0.25) formatted = `${whole > 0 ? whole : ""} 1/4`.trim();
    else if (decimal === 0.5)
      formatted = `${whole > 0 ? whole : ""} 1/2`.trim();
    else if (decimal === 0.75)
      formatted = `${whole > 0 ? whole : ""} 3/4`.trim();
    else if (decimal === 0.33)
      formatted = `${whole > 0 ? whole : ""} 1/3`.trim();
    else if (decimal === 0.67)
      formatted = `${whole > 0 ? whole : ""} 2/3`.trim();
  }

  return isNotNil(unit) ? `${formatted} ${unit}` : formatted;
};

export type ItemRecipeIngredient = {
  id: string;
  recipe: {
    id: string;
    name: string;
    type: string;
    image_url?: string | null;
    difficulty_level?: number | null;
  };
  quantity?: number | null;
  unit?: string | null;
  is_optional?: boolean | null;
};

export type ItemRecipesProps = {
  recipeIngredients: ItemRecipeIngredient[];
  title?: string;
  itemName?: string;
};

export const ItemRecipes = ({
  recipeIngredients,
  title = "Used in Recipes",
  itemName = "this item",
}: ItemRecipesProps) => {
  if (recipeIngredients.length === 0) {
    return null;
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography level="title-sm" sx={{ mb: 2 }}>
          {title} ({recipeIngredients.length})
        </Typography>

        <Stack spacing={2}>
          {recipeIngredients.map((ingredient) => {
            const recipe = ingredient.recipe;
            const fallback = getFallback(recipe.type);
            const quantityText = formatQuantity(
              ingredient.quantity,
              ingredient.unit,
            );

            return (
              <Box key={ingredient.id}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "sm",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: "background.level1",
                    }}
                  >
                    {isNotNil(recipe.image_url) ? (
                      <Image
                        src={recipe.image_url}
                        alt={recipe.name}
                        width={48}
                        height={48}
                        style={{ objectFit: "cover", borderRadius: "4px" }}
                      />
                    ) : (
                      <Image
                        src={fallback.image}
                        alt={fallback.alt}
                        width={48}
                        height={48}
                        style={{ objectFit: "cover", borderRadius: "4px" }}
                      />
                    )}
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Link href={`/recipes/${recipe.id}`}>
                        <Typography
                          level="body-md"
                          fontWeight="md"
                          sx={{ textDecoration: "underline" }}
                        >
                          {recipe.name}
                        </Typography>
                      </Link>

                      <Chip
                        variant="soft"
                        size="sm"
                        startDecorator={
                          recipe.type === "food" ? <MdRestaurant /> : undefined
                        }
                        sx={{ textTransform: "capitalize" }}
                      >
                        {recipe.type}
                      </Chip>

                      {isNotNil(recipe.difficulty_level) && (
                        <Chip
                          color={getDifficultyColor(recipe.difficulty_level)}
                          variant="outlined"
                          size="sm"
                        >
                          {getDifficultyText(recipe.difficulty_level)}
                        </Chip>
                      )}

                      {ingredient.is_optional && (
                        <Chip variant="outlined" size="sm" color="neutral">
                          Optional
                        </Chip>
                      )}
                    </Stack>

                    <Typography
                      level="body-sm"
                      sx={{ color: "text.secondary" }}
                    >
                      {quantityText
                        ? `${quantityText} of ${itemName}`
                        : `Uses ${itemName}`}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};
