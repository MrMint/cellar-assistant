"use client";

import {
  AspectRatio,
  Box,
  Card,
  CardContent,
  CardOverflow,
  Chip,
  Link as JoyLink,
  Stack,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { memo, useMemo } from "react";
import {
  MdAccessTime,
  MdGroup,
  MdLocalBar,
  MdSignalCellular1Bar,
} from "react-icons/md";
import { breakpointDown, useMediaQuery } from "@/hooks/useMediaQuery";
import { formatSpirit, type RecipeGroupCardData } from "./adapter";

export type { RecipeGroupCardData };

export type RecipeGroupCardProps = {
  recipeGroup: RecipeGroupCardData;
  href?: string;
  onClick?: (groupId: string) => void;
  showVersionCount?: boolean;
};

/**
 * `82450ad1:src/components/recipe/RecipeGroupCard.tsx`, restored.
 *
 * The canonical summary ("Featured: …", difficulty stars, minutes, serves,
 * picture) renders for the first time: the old grid query selected
 * `canonical_recipe_rel`, the card read `canonical_recipe`, so production
 * never showed it. It comes from `RecipeGroup.canonicalRecipe` (G28's
 * fallback, one loader read per card); a group nobody has voted on has no
 * canonical and shows the group's own description, as the old card would
 * have. The picture is a plain `<img>` inside the `AspectRatio` (a free-form
 * URL; `next/image` would need its host allowlisted).
 */
export const RecipeGroupCard = memo<RecipeGroupCardProps>(
  ({
    recipeGroup,
    href,
    onClick,
    showVersionCount = true,
  }: RecipeGroupCardProps) => {
    const isMobile = useMediaQuery(breakpointDown("sm"));
    const _isTablet = useMediaQuery(breakpointDown("md"));
    const handleClick = () => {
      if (onClick) {
        onClick(recipeGroup.id);
      }
    };

    // Memoized computed values for performance
    const { canonical, versionCount, imageUrl, formattedSpirit } =
      useMemo(() => {
        const canonical = recipeGroup.canonical_recipe;
        const versionCount = recipeGroup.recipes_aggregate.aggregate.count;
        const imageUrl = canonical?.image_url;

        // Format base spirit
        const formattedSpirit = formatSpirit(recipeGroup.base_spirit);

        return { canonical, versionCount, imageUrl, formattedSpirit };
      }, [recipeGroup]);

    // Format difficulty level
    const getDifficultyDisplay = useMemo(() => {
      return (level?: number | null) => {
        if (!level) return null;
        const stars = "★".repeat(level);
        const emptyStars = "☆".repeat(5 - level);
        return `${stars}${emptyStars}`;
      };
    }, []);

    const cardContent = (
      <Card
        variant="outlined"
        sx={{
          cursor: href || onClick ? "pointer" : "default",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            transform: href || onClick ? "translateY(-2px)" : "none",
            boxShadow: href || onClick ? "lg" : "none",
          },
        }}
        onClick={handleClick}
      >
        {imageUrl && (
          <CardOverflow>
            <AspectRatio ratio="4/3">
              <Box
                component="img"
                src={imageUrl}
                alt={canonical?.name || recipeGroup.name}
                sx={{ objectFit: "cover" }}
              />
            </AspectRatio>
          </CardOverflow>
        )}

        <CardContent sx={{ gap: 1 }}>
          {/* Recipe Group Name */}
          <Typography level="title-md" component="h3">
            {recipeGroup.name}
          </Typography>

          {/* Canonical Recipe Name (if different) */}
          {canonical && canonical.name !== recipeGroup.name && (
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              Featured: {canonical.name}
            </Typography>
          )}

          {/* Description */}
          {(canonical?.description || recipeGroup.description) && (
            <Typography
              level="body-sm"
              sx={{
                color: "text.secondary",
                display: "-webkit-box",
                WebkitLineClamp: isMobile ? 1 : 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontSize: isMobile ? "0.8rem" : undefined,
              }}
            >
              {canonical?.description || recipeGroup.description}
            </Typography>
          )}

          {/* Recipe Details */}
          {canonical && (
            <Stack
              direction="row"
              spacing={isMobile ? 1 : 2}
              flexWrap="wrap"
              sx={{ mt: 1 }}
            >
              {canonical.difficulty_level && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <MdSignalCellular1Bar size={isMobile ? 14 : 16} />
                  <Typography
                    level="body-xs"
                    sx={{ fontSize: isMobile ? "0.7rem" : undefined }}
                  >
                    {getDifficultyDisplay(canonical.difficulty_level)}
                  </Typography>
                </Box>
              )}

              {canonical.prep_time_minutes && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <MdAccessTime size={isMobile ? 14 : 16} />
                  <Typography
                    level="body-xs"
                    sx={{ fontSize: isMobile ? "0.7rem" : undefined }}
                  >
                    {canonical.prep_time_minutes}m
                  </Typography>
                </Box>
              )}

              {canonical.serving_size && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography
                    level="body-xs"
                    sx={{ fontSize: isMobile ? "0.7rem" : undefined }}
                  >
                    Serves {canonical.serving_size}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}

          {/* Category and Base Spirit */}
          <Stack
            direction="row"
            spacing={isMobile ? 0.5 : 1}
            flexWrap="wrap"
            sx={{ mt: 1 }}
          >
            <Chip
              size={isMobile ? "sm" : "sm"}
              variant="soft"
              color="primary"
              sx={{ fontSize: isMobile ? "0.7rem" : undefined }}
            >
              {recipeGroup.category}
            </Chip>

            {formattedSpirit && (
              <Chip
                size={isMobile ? "sm" : "sm"}
                variant="soft"
                color="neutral"
                startDecorator={<MdLocalBar size={isMobile ? 14 : 16} />}
                sx={{ fontSize: isMobile ? "0.7rem" : undefined }}
              >
                {formattedSpirit}
              </Chip>
            )}

            {showVersionCount && versionCount > 1 && (
              <Chip
                size={isMobile ? "sm" : "sm"}
                variant="soft"
                color="warning"
                startDecorator={<MdGroup size={isMobile ? 14 : 16} />}
                sx={{ fontSize: isMobile ? "0.7rem" : undefined }}
              >
                {isMobile ? `${versionCount}` : `${versionCount} versions`}
              </Chip>
            )}
          </Stack>

          {/* Tags */}
          {recipeGroup.tags && recipeGroup.tags.length > 0 && (
            <Stack
              direction="row"
              spacing={isMobile ? 0.25 : 0.5}
              flexWrap="wrap"
              sx={{ mt: 1 }}
            >
              {recipeGroup.tags.slice(0, isMobile ? 2 : 3).map((tag) => (
                <Chip
                  key={`tag-${tag}`}
                  size={isMobile ? "sm" : "sm"}
                  variant="outlined"
                  color="neutral"
                  sx={{ fontSize: isMobile ? "0.65rem" : undefined }}
                >
                  {tag}
                </Chip>
              ))}
              {recipeGroup.tags.length > (isMobile ? 2 : 3) && (
                <Typography
                  level="body-xs"
                  sx={{
                    color: "text.secondary",
                    alignSelf: "center",
                    fontSize: isMobile ? "0.65rem" : undefined,
                  }}
                >
                  +{recipeGroup.tags.length - (isMobile ? 2 : 3)} more
                </Typography>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>
    );

    if (href) {
      return (
        <JoyLink component={Link} href={href} underline="none">
          {cardContent}
        </JoyLink>
      );
    }

    return cardContent;
  },
);

RecipeGroupCard.displayName = "RecipeGroupCard";
