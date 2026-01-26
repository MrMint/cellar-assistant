"use client";

import { CardContent, CardOverflow, Chip, Divider, Typography } from "@mui/joy";
import type { SxProps } from "@mui/joy/styles/types";
import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import type { MouseEvent } from "react";
import { MdAccessTime, MdGroup, MdRestaurant, MdStar } from "react-icons/md";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import { Link } from "@/components/common/Link";
import beer1 from "@/images/beer1.png"; // Using as food placeholder
import wine1 from "@/images/wine1.png"; // Using as cocktail placeholder

const overflowItemStyles: SxProps = {
  justifyContent: "center",
  textAlign: "center",
  flexGrow: 1,
  py: 1,
};

const getFallback = (type: "food" | "cocktail") => {
  return type === "food"
    ? { image: beer1, alt: "A food dish" }
    : { image: wine1, alt: "A cocktail" };
};

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

export type RecipeCardItem = {
  id: string;
  name: string;
  description?: string | null;
  type: "food" | "cocktail";
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  image_url?: string | null;
  ingredient_count?: number;
  compatibility_score?: number; // Future: percentage of ingredients available in user's cellar
};

export type RecipeCardProps = {
  recipe: RecipeCardItem;
  href?: string;
  onClick?: (recipeId: string) => void;
  showCompatibility?: boolean;
};

export const RecipeCard = ({
  recipe,
  href,
  onClick,
  showCompatibility = false,
}: RecipeCardProps) => {
  const fallback = getFallback(recipe.type);

  const _handleClick = (
    event: MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>,
  ) => {
    event.stopPropagation();
    if (onClick) {
      onClick(recipe.id);
    }
  };

  return (
    <InteractiveCard
      onClick={isNotNil(onClick) ? () => onClick(recipe.id) : undefined}
    >
      <CardOverflow
        sx={{ aspectRatio: { xs: 1.2, sm: 1 }, padding: 0, overflow: "hidden" }}
      >
        {isNotNil(recipe.image_url) && (
          <Image
            style={{
              aspectRatio: "1",
              objectFit: "cover",
              height: "auto",
              width: "auto",
            }}
            src={recipe.image_url}
            alt={recipe.name}
            height={400}
            width={400}
          />
        )}
        {isNil(recipe.image_url) && (
          <Image
            src={fallback.image}
            alt={fallback.alt}
            fill
            placeholder="blur"
          />
        )}

        {/* Difficulty badge overlay */}
        {isNotNil(recipe.difficulty_level) && (
          <Chip
            color={getDifficultyColor(recipe.difficulty_level)}
            size="sm"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1,
            }}
          >
            {getDifficultyText(recipe.difficulty_level)}
          </Chip>
        )}

        {/* Recipe type badge */}
        <Chip
          variant="soft"
          size="sm"
          startDecorator={recipe.type === "food" ? <MdRestaurant /> : undefined}
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 1,
            textTransform: "capitalize",
          }}
        >
          {recipe.type}
        </Chip>
      </CardOverflow>

      {isNotNil(href) && (
        <CardContent>
          <Link overlay href={href}>
            <Typography level="title-md" noWrap>
              {recipe.name}
            </Typography>
          </Link>
          {isNotNil(recipe.description) && (
            <Typography
              level="body-sm"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                mt: 0.5,
              }}
            >
              {recipe.description}
            </Typography>
          )}
        </CardContent>
      )}

      {isNil(href) && isNotNil(onClick) && (
        <CardContent>
          <Typography level="title-md" noWrap>
            {recipe.name}
          </Typography>
          {isNotNil(recipe.description) && (
            <Typography
              level="body-sm"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                mt: 0.5,
              }}
            >
              {recipe.description}
            </Typography>
          )}
        </CardContent>
      )}

      <CardOverflow
        variant="soft"
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1,
          justifyContent: "space-around",
          overflow: "hidden",
          alignItems: "center",
          padding: 0,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* Prep time */}
        {isNotNil(recipe.prep_time_minutes) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={<MdAccessTime />}
            level="body-sm"
          >
            {recipe.prep_time_minutes}m
          </Typography>
        )}

        {isNotNil(recipe.prep_time_minutes) && (
          <Divider orientation="vertical" />
        )}

        {/* Serving size */}
        {isNotNil(recipe.serving_size) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={<MdGroup />}
            level="body-sm"
          >
            {recipe.serving_size}
          </Typography>
        )}

        {isNotNil(recipe.serving_size) && <Divider orientation="vertical" />}

        {/* Ingredient count */}
        {isNotNil(recipe.ingredient_count) && (
          <Typography sx={overflowItemStyles} level="body-sm">
            {recipe.ingredient_count} ingredients
          </Typography>
        )}

        {/* Compatibility score (future feature) */}
        {showCompatibility && isNotNil(recipe.compatibility_score) && (
          <>
            <Divider orientation="vertical" />
            <Typography
              sx={overflowItemStyles}
              endDecorator={
                <MdStar
                  style={{
                    color:
                      recipe.compatibility_score > 80
                        ? "#ffba26"
                        : "var(--Icon-color)",
                    fontSize: "1.2rem",
                  }}
                />
              }
              level="body-sm"
            >
              {recipe.compatibility_score}%
            </Typography>
          </>
        )}
      </CardOverflow>
    </InteractiveCard>
  );
};
