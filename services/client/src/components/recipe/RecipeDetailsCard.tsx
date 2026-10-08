"use client";

import { isNotNil, without } from "ramda";
import { People, Restaurant, Time } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { cn } from "@/lib/utils";

/**
 * Easy reads as success text, hard as danger text; medium is neutral — the
 * palette has no warning role, and neither colour is ever a solid slab
 * (design §3.1).
 */
const getDifficultyClass = (level: number) => {
  if (level <= 2) return "bg-success/10 text-success";
  if (level <= 3) return "bg-surface-2 text-ink-1";
  return "border-destructive/60 text-destructive";
};

const getDifficultyText = (level: number) => {
  if (level === 1) return "Very Easy";
  if (level === 2) return "Easy";
  if (level === 3) return "Medium";
  if (level === 4) return "Hard";
  return "Very Hard";
};

/** Joy's `md` chip: a 28 px pill with 14 px text and 16 px icons. */
const CHIP = "h-7 px-3 text-sm [&>svg]:size-4";

export type RecipeDetailsCardProps = {
  recipeId: string;
  title: string;
  type: "food" | "cocktail";
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  version?: number | null;
  description?: string | null;
  /** X08's Save target; omitted, no bookmark is drawn. */
  isWantToTry?: boolean;
};

/**
 * `82450ad1:src/components/recipe/RecipeDetailsCard.tsx`, restored.
 *
 * Dropped: the favourite heart beside the title. Its click handler was a
 * `TODO` that logged "not implemented yet", and there is still no recipe
 * favourite anywhere in the API — so it was a control that did nothing, and
 * the inventory lists it as a deliberate drop (§4, X). Its place is taken
 * by Save (X08, D27): the Want to try bookmark, which does something.
 */
export function RecipeDetailsCard({
  recipeId,
  title,
  type,
  difficulty_level,
  prep_time_minutes,
  serving_size,
  version,
  description,
  isWantToTry,
}: RecipeDetailsCardProps) {
  const subTitlePhrases = [
    type,
    isNotNil(difficulty_level) ? getDifficultyText(difficulty_level) : null,
    isNotNil(prep_time_minutes) ? `${prep_time_minutes} minutes` : null,
    isNotNil(serving_size) ? `Serves ${serving_size}` : null,
    isNotNil(version) && version > 1 ? `Version ${version}` : null,
  ];

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <div className="flex items-start gap-2">
        <h3 className="type-title-2 min-w-0 flex-1">{title}</h3>
        {isWantToTry !== undefined && (
          <WantToTryButton
            target={{ kind: "RECIPE", recipeId }}
            saved={isWantToTry}
            name={title}
            className="-my-2 -mr-2 shrink-0"
          />
        )}
      </div>

      {/* Each phrase is one unbreakable run, so a wrap falls between phrases
          ("… • 3 Minutes •" / "Serves 1"), never inside one ("Serves" / "1"). */}
      <p className="type-body text-ink-2 capitalize">
        {without([null, undefined], subTitlePhrases).map((phrase, index) => (
          <span key={phrase}>
            {index > 0 && " • "}
            <span className="whitespace-nowrap">{phrase}</span>
          </span>
        ))}
      </p>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className={CHIP}>
          {type === "food" && <Restaurant aria-hidden />}
          <span className="capitalize">{type}</span>
        </Badge>

        {isNotNil(difficulty_level) && (
          <Badge
            variant="outline"
            className={cn(CHIP, getDifficultyClass(difficulty_level))}
          >
            {getDifficultyText(difficulty_level)}
          </Badge>
        )}

        {isNotNil(prep_time_minutes) && (
          <Badge variant="outline" className={CHIP}>
            <Time aria-hidden />
            {prep_time_minutes} min
          </Badge>
        )}

        {isNotNil(serving_size) && (
          <Badge variant="outline" className={CHIP}>
            <People aria-hidden />
            Serves {serving_size}
          </Badge>
        )}
      </div>

      {isNotNil(description) && (
        <p className="type-callout text-ink-2">{description}</p>
      )}
    </section>
  );
}
