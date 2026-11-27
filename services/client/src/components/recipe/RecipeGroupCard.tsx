"use client";

import { memo } from "react";
import { Link } from "@/components/app/Link";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import { cn } from "@/lib/utils";
import { formatSpirit, type RecipeGroupCardData } from "./adapter";
import { RecipeThumb } from "./RecipePlate";
import { recipeRowLine, versionsLine } from "./recipe-meta";

export type { RecipeGroupCardData };

export type RecipeGroupCardProps = {
  recipeGroup: RecipeGroupCardData;
  href?: string;
  onClick?: (groupId: string) => void;
  showVersionCount?: boolean;
};

/**
 * One recipe in All recipes (Recipes-Browse 01, 04): a card row with the
 * photo, or the kit's recipe face, then the name, "Rum · Easy · 4 min" and
 * one line of description; "3 versions" when the drink has more than one.
 * The whole row is the group's link; press .97 with the press sound.
 */
export const RecipeGroupCard = memo<RecipeGroupCardProps>(
  ({
    recipeGroup,
    href,
    onClick,
    showVersionCount = true,
  }: RecipeGroupCardProps) => {
    const canonical = recipeGroup.canonical_recipe;
    const versionCount = recipeGroup.recipes_aggregate.aggregate.count;
    const imageUrl = canonical?.image_url;
    const description = canonical?.description || recipeGroup.description;
    const line = recipeRowLine(
      formatSpirit(recipeGroup.base_spirit),
      canonical?.difficulty_level,
      canonical?.prep_time_minutes,
    );

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: the optional `onClick(groupId)`; the keyboard path is the title link.
      // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
      <div
        data-slot="recipe-group-card"
        {...(href !== undefined || onClick !== undefined
          ? pressFeedback()
          : {})}
        className={cn(
          "relative flex min-h-[88px] items-stretch overflow-hidden rounded-lg border border-edge bg-card",
          (href !== undefined || onClick !== undefined) && PRESS_CLASS,
        )}
        onClick={() => onClick?.(recipeGroup.id)}
      >
        <div className="relative w-[88px] shrink-0 bg-raised">
          {imageUrl ? (
            // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <RecipeThumb type="cocktail" name={recipeGroup.name} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3">
          {/* An h3 under /recipes' "All recipes" h2 (X21). */}
          <h3 className="t-head m-0 truncate text-ink">
            {href ? (
              <Link href={href} overlay underline="none">
                {recipeGroup.name}
              </Link>
            ) : (
              recipeGroup.name
            )}
          </h3>
          {line !== "" && (
            <p className="t-cap m-0 truncate text-ink-2">{line}</p>
          )}
          {description && (
            <p className="t-cap m-0 line-clamp-1 text-ink-2">{description}</p>
          )}
          {showVersionCount && versionCount > 1 && (
            <p className="t-cap m-0 text-ink-3">{versionsLine(versionCount)}</p>
          )}
        </div>
      </div>
    );
  },
);

RecipeGroupCard.displayName = "RecipeGroupCard";
