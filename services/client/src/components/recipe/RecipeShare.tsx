"use client";

import { useCallback } from "react";
import type { AppBarOverflowItem } from "@/components/app/AppBar";
import { absoluteUrl, canonicalPath } from "@/lib/share/routes";
import { useShareLink } from "@/lib/share/use-share-link";

/**
 * A recipe's Share (X17): a row in the page's `⋯`, the app's one share
 * behaviour (`lib/share/share-link.ts` — the share sheet, else the link
 * copied), and the share text names the drink. It replaces the "Share Recipe"
 * card that sat under the photo and said only "Check out this cocktail
 * recipe!". The link is the recipe's own page, public to someone signed out
 * (`src/proxy.ts`).
 */
export function useRecipeShareItem({
  recipeId,
  recipeName,
}: {
  recipeId: string;
  recipeName: string;
}): AppBarOverflowItem {
  const share = useShareLink();
  const onSelect = useCallback(() => {
    void share({
      url: absoluteUrl(
        window.location.origin,
        canonicalPath({ kind: "recipe", id: recipeId }),
      ),
      title: recipeName,
      text: `${recipeName}: the recipe, on Cellar Assistant`,
    });
  }, [share, recipeId, recipeName]);
  return { label: "Share recipe", onSelect };
}
