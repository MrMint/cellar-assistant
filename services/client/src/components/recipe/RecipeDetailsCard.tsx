"use client";

import { Card, Chip, Stack, Typography } from "@mui/joy";
import { isNotNil, without } from "ramda";
import { MdAccessTime, MdGroup, MdRestaurant } from "react-icons/md";

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

export type RecipeDetailsCardProps = {
  recipeId: string;
  title: string;
  type: "food" | "cocktail";
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  version?: number | null;
  description?: string | null;
};

/**
 * `82450ad1:src/components/recipe/RecipeDetailsCard.tsx`, restored.
 *
 * Dropped: the favourite heart beside the title. Its click handler was a
 * `TODO` that logged "not implemented yet", and there is still no recipe
 * favourite anywhere in the API — so it was a control that did nothing, and
 * the inventory lists it as a deliberate drop (§4, X).
 */
export function RecipeDetailsCard({
  title,
  type,
  difficulty_level,
  prep_time_minutes,
  serving_size,
  version,
  description,
}: RecipeDetailsCardProps) {
  const subTitlePhrases = [
    type,
    isNotNil(difficulty_level) ? getDifficultyText(difficulty_level) : null,
    isNotNil(prep_time_minutes) ? `${prep_time_minutes} minutes` : null,
    isNotNil(serving_size) ? `Serves ${serving_size}` : null,
    isNotNil(version) && version > 1 ? `Version ${version}` : null,
  ];

  return (
    <Card>
      <Stack spacing={2}>
        <Typography level="h3">{title}</Typography>

        <Typography level="body-md" sx={{ textTransform: "capitalize" }}>
          {without([null, undefined], subTitlePhrases).join(" • ")}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            variant="soft"
            startDecorator={type === "food" ? <MdRestaurant /> : undefined}
            sx={{ textTransform: "capitalize" }}
          >
            {type}
          </Chip>

          {isNotNil(difficulty_level) && (
            <Chip color={getDifficultyColor(difficulty_level)} variant="soft">
              {getDifficultyText(difficulty_level)}
            </Chip>
          )}

          {isNotNil(prep_time_minutes) && (
            <Chip variant="outlined" startDecorator={<MdAccessTime />}>
              {prep_time_minutes} min
            </Chip>
          )}

          {isNotNil(serving_size) && (
            <Chip variant="outlined" startDecorator={<MdGroup />}>
              Serves {serving_size}
            </Chip>
          )}
        </Stack>

        {isNotNil(description) && (
          <Typography level="body-sm">{description}</Typography>
        )}
      </Stack>
    </Card>
  );
}
