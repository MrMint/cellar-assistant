"use client";

import { memo, useMemo } from "react";
import { Cocktail, People, Time, WeakSignal } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Badge } from "@/components/ui/badge";
import { breakpointDown, useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
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
    // Logic only (how many tags, "3" or "3 versions"); sizes are `sm:` classes.
    const isMobile = useMediaQuery(breakpointDown("sm"));
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

    const interactive = Boolean(href || onClick);
    const tagLimit = isMobile ? 2 : 3;

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: the old card's optional `onClick(groupId)`; the keyboard path is the title link.
      // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
      <div
        data-slot="recipe-group-card"
        className={cn(
          "touch-none-select relative flex flex-col overflow-hidden rounded-lg bg-surface-1",
          interactive &&
            "cursor-pointer transition-transform duration-(--ca-dur-short) ease-standard active:scale-97 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:active:scale-100 motion-reduce:hover:translate-y-0",
        )}
        onClick={handleClick}
      >
        {imageUrl && (
          <div className="aspect-[4/3] bg-surface-2">
            {/* biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted. */}
            <img
              src={imageUrl}
              alt={canonical?.name || recipeGroup.name}
              className="size-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 p-4">
          {/* Recipe Group Name */}
          <h3 className="type-headline">
            {href ? (
              <Link href={href} overlay underline="none">
                {recipeGroup.name}
              </Link>
            ) : (
              recipeGroup.name
            )}
          </h3>

          {/* Canonical Recipe Name (if different) */}
          {canonical && canonical.name !== recipeGroup.name && (
            <p className="type-callout text-ink-2">
              Featured: {canonical.name}
            </p>
          )}

          {/* Description */}
          {(canonical?.description || recipeGroup.description) && (
            <p className="line-clamp-1 type-footnote text-ink-2 sm:line-clamp-2 sm:type-callout">
              {canonical?.description || recipeGroup.description}
            </p>
          )}

          {/* Recipe Details */}
          {canonical && (
            <div className="mt-2 flex flex-wrap gap-2 type-footnote sm:gap-4">
              {canonical.difficulty_level && (
                <span className="flex items-center gap-1">
                  <WeakSignal aria-hidden className="size-3.5 sm:size-4" />
                  {getDifficultyDisplay(canonical.difficulty_level)}
                </span>
              )}

              {canonical.prep_time_minutes && (
                <span className="flex items-center gap-1">
                  <Time aria-hidden className="size-3.5 sm:size-4" />
                  <span className="tabular">
                    {canonical.prep_time_minutes}m
                  </span>
                </span>
              )}

              {canonical.serving_size && (
                <span className="flex items-center gap-1">
                  Serves {canonical.serving_size}
                </span>
              )}
            </div>
          )}

          {/* Category and Base Spirit */}
          <div className="mt-2 flex flex-wrap gap-1 sm:gap-2">
            <Badge variant="secondary">{recipeGroup.category}</Badge>

            {formattedSpirit && (
              <Badge variant="secondary">
                <Cocktail aria-hidden />
                {formattedSpirit}
              </Badge>
            )}

            {showVersionCount && versionCount > 1 && (
              <Badge variant="secondary">
                <People aria-hidden />
                {isMobile ? `${versionCount}` : `${versionCount} versions`}
              </Badge>
            )}
          </div>

          {/* Tags */}
          {recipeGroup.tags && recipeGroup.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-0.5 sm:gap-1">
              {recipeGroup.tags.slice(0, tagLimit).map((tag) => (
                <Badge key={`tag-${tag}`} variant="outline">
                  {tag}
                </Badge>
              ))}
              {recipeGroup.tags.length > tagLimit && (
                <span className="self-center type-footnote text-ink-2">
                  +{recipeGroup.tags.length - tagLimit} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

RecipeGroupCard.displayName = "RecipeGroupCard";
