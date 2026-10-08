"use client";

import { Share } from "@/components/app/icons";
import { Button } from "@/components/ui/button";

interface RecipeShareProps {
  recipeId: string;
  recipeType: "food" | "cocktail";
}

/**
 * `82450ad1:src/components/recipe/RecipeShare.tsx`, restored. Its two
 * `console.log`s on a dismissed share sheet are gone; nothing else changed.
 */
export function RecipeShare({ recipeType }: RecipeShareProps) {
  const handleShare = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Recipe from Cellar Assistant`,
          text: `Check out this ${recipeType} recipe!`,
          url: window.location.href,
        });
      } catch {
        // User canceled sharing or sharing failed
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
      } catch {
        // Clipboard refused (insecure context, or permission denied)
      }
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <p className="type-callout font-semibold">Share Recipe</p>
      <Button variant="outline" onClick={handleShare}>
        <Share aria-hidden />
        Share
      </Button>
    </section>
  );
}
