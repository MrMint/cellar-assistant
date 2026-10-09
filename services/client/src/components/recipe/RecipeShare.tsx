"use client";

import { useCallback } from "react";
import type { AppBarOverflowItem } from "@/components/app/AppBar";
import { notify } from "@/components/app/notify";
import { absoluteUrl, canonicalPath } from "@/lib/share/routes";
import { recipeShareBlock } from "@/lib/share/share-rules";
import { useShareLink } from "@/lib/share/use-share-link";

/** The share sheet's words: the drink's name first, then where it lives. */
export const recipeShareText = (recipeName: string): string =>
  `${recipeName}: the recipe, on Cellar Assistant`;

/**
 * A recipe's Share (X17): a row in the page's `⋯`, the app's one share
 * behaviour (`lib/share/share-link.ts` — the share sheet, else the link
 * copied), and the share text names the drink. The link is the recipe's own
 * page, public to someone signed out (`src/proxy.ts`) — when the recipe is.
 *
 * X15 / D22: a recipe is private first. Its author still gets the row on a
 * PRIVATE recipe or a draft, and it says how to make it shareable instead of
 * handing out a link that 404s for everyone else (`recipeShareBlock`).
 */
export function useRecipeShareItem({
  recipeId,
  recipeName,
  privacy = "PUBLIC",
  isDraft = false,
  isOwner = false,
}: {
  recipeId: string;
  recipeName: string;
  privacy?: string;
  isDraft?: boolean;
  isOwner?: boolean;
}): AppBarOverflowItem {
  const share = useShareLink();
  const onSelect = useCallback(() => {
    const blocked = recipeShareBlock(privacy, isDraft, isOwner);
    if (blocked !== null) {
      notify(blocked.message, { description: blocked.description });
      return;
    }
    void share({
      url: absoluteUrl(
        window.location.origin,
        canonicalPath({ kind: "recipe", id: recipeId }),
      ),
      title: recipeName,
      text: recipeShareText(recipeName),
    });
  }, [share, recipeId, recipeName, privacy, isDraft, isOwner]);
  return { label: "Share recipe", onSelect };
}
