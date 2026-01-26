"use client";

import { Box, Button, Chip, Divider, Stack, Typography } from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { MdCheckCircle, MdError, MdInfo, MdWarning } from "react-icons/md";
import { Link } from "@/components/common/Link";

export type RecipeIngredient = {
  id: string;
  quantity?: number | null;
  unit?: string | null;
  is_optional?: boolean | null;
  substitution_notes?: string | null;
  wine_id?: string | null;
  beer_id?: string | null;
  spirit_id?: string | null;
  coffee_id?: string | null;
  generic_item_id?: string | null;
  wine?: { id: string; name: string; vintage?: string | null } | null;
  beer?: { id: string; name: string } | null;
  spirit?: { id: string; name: string } | null;
  coffee?: { id: string; name: string } | null;
  generic_item?: {
    id: string;
    name: string;
    category?: string | null;
    subcategory?: string | null;
    item_type?: string | null;
  } | null;
};

export type RecipeIngredientListProps = {
  ingredients: RecipeIngredient[];
  userId?: string; // For future compatibility checking
  showAvailability?: boolean;
  showSubstitutions?: boolean;
};

const getIngredientDisplay = (ingredient: RecipeIngredient) => {
  // Determine which item type this ingredient represents
  if (isNotNil(ingredient.wine)) {
    const vintage = ingredient.wine.vintage
      ? `${ingredient.wine.vintage} `
      : "";
    return {
      name: `${vintage}${ingredient.wine.name}`,
      type: "wine" as const,
      itemId: ingredient.wine.id,
      isSpecific: true,
    };
  }

  if (isNotNil(ingredient.beer)) {
    return {
      name: ingredient.beer.name,
      type: "beer" as const,
      itemId: ingredient.beer.id,
      isSpecific: true,
    };
  }

  if (isNotNil(ingredient.spirit)) {
    return {
      name: ingredient.spirit.name,
      type: "spirit" as const,
      itemId: ingredient.spirit.id,
      isSpecific: true,
    };
  }

  if (isNotNil(ingredient.coffee)) {
    return {
      name: ingredient.coffee.name,
      type: "coffee" as const,
      itemId: ingredient.coffee.id,
      isSpecific: true,
    };
  }

  if (isNotNil(ingredient.generic_item)) {
    return {
      name: ingredient.generic_item.name,
      type: ingredient.generic_item.item_type || "ingredient",
      itemId: ingredient.generic_item.id,
      isSpecific: false,
      category: ingredient.generic_item.category,
      subcategory: ingredient.generic_item.subcategory,
    };
  }

  return {
    name: "Unknown ingredient",
    type: "unknown" as const,
    itemId: null,
    isSpecific: false,
  };
};

const getAvailabilityStatus = (
  ingredient: RecipeIngredient,
  userId?: string,
) => {
  // Future: Check user's cellar for ingredient availability
  // For now, return placeholder status
  if (!userId) return null;

  const display = getIngredientDisplay(ingredient);

  // Mock availability logic - replace with actual cellar checking
  const mockAvailability = Math.random();

  if (display.isSpecific) {
    if (mockAvailability > 0.7) {
      return { status: "available", message: "In your cellar" };
    }
    if (mockAvailability > 0.4) {
      return { status: "substitutable", message: "Similar items available" };
    }
    return { status: "missing", message: "Not in cellar" };
  } else {
    if (mockAvailability > 0.6) {
      return { status: "available", message: "Matching items in cellar" };
    }
    if (mockAvailability > 0.3) {
      return { status: "partial", message: "Some matching items" };
    }
    return { status: "missing", message: "No matching items" };
  }
};

const getAvailabilityIcon = (status: string) => {
  switch (status) {
    case "available":
      return (
        <MdCheckCircle style={{ color: "var(--joy-palette-success-500)" }} />
      );
    case "substitutable":
    case "partial":
      return <MdWarning style={{ color: "var(--joy-palette-warning-500)" }} />;
    case "missing":
      return <MdError style={{ color: "var(--joy-palette-danger-500)" }} />;
    default:
      return <MdInfo style={{ color: "var(--joy-palette-neutral-500)" }} />;
  }
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

export const RecipeIngredientList = ({
  ingredients,
  userId,
  showAvailability = true,
  showSubstitutions = true,
}: RecipeIngredientListProps) => {
  return (
    <Stack spacing={2}>
      {ingredients.map((ingredient, index) => {
        const display = getIngredientDisplay(ingredient);
        const availability = showAvailability
          ? getAvailabilityStatus(ingredient, userId)
          : null;
        const quantityText = formatQuantity(
          ingredient.quantity,
          ingredient.unit,
        );

        return (
          <Box key={ingredient.id}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              {/* Availability indicator */}
              {availability && (
                <Box sx={{ mt: 0.5 }}>
                  {getAvailabilityIcon(availability.status)}
                </Box>
              )}

              {/* Ingredient details */}
              <Stack spacing={1} sx={{ flex: 1 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                >
                  {/* Quantity */}
                  {quantityText && (
                    <Typography level="body-md" fontWeight="md">
                      {quantityText}
                    </Typography>
                  )}

                  {/* Ingredient name */}
                  {display.isSpecific && display.itemId ? (
                    <Link href={`/${display.type}s/${display.itemId}`}>
                      <Typography
                        level="body-md"
                        sx={{ textDecoration: "underline" }}
                      >
                        {display.name}
                      </Typography>
                    </Link>
                  ) : (
                    <Typography level="body-md">{display.name}</Typography>
                  )}

                  {/* Optional indicator */}
                  {ingredient.is_optional && (
                    <Chip variant="outlined" size="sm" color="neutral">
                      Optional
                    </Chip>
                  )}

                  {/* Ingredient type for generic items */}
                  {!display.isSpecific && display.category && (
                    <Chip variant="soft" size="sm">
                      {display.category}
                    </Chip>
                  )}
                </Stack>

                {/* Availability message */}
                {availability && (
                  <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                    {availability.message}
                  </Typography>
                )}

                {/* Substitution notes */}
                {showSubstitutions &&
                  isNotNil(ingredient.substitution_notes) && (
                    <Typography
                      level="body-sm"
                      sx={{
                        color: "text.secondary",
                        fontStyle: "italic",
                      }}
                    >
                      Note: {ingredient.substitution_notes}
                    </Typography>
                  )}

                {/* Future: Show available substitutions */}
                {showSubstitutions &&
                  availability?.status === "substitutable" && (
                    <Button
                      variant="outlined"
                      size="sm"
                      sx={{ alignSelf: "flex-start", mt: 1 }}
                    >
                      View substitutions
                    </Button>
                  )}
              </Stack>
            </Stack>

            {index < ingredients.length - 1 && <Divider sx={{ my: 2 }} />}
          </Box>
        );
      })}
    </Stack>
  );
};
