"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AppBarOverflowItem } from "@/components/app/AppBar";
import { notify } from "@/components/app/notify";
import { ShareSheet } from "@/components/app/overlays/ShareSheet";
import { absoluteUrl, canonicalPath } from "@/lib/share/routes";
import { recipeShareBlock } from "@/lib/share/share-rules";

/** The share sheet's words: the drink's name first, then where it lives. */
export const recipeShareText = (recipeName: string): string =>
  `${recipeName}: the recipe, on Cellar Assistant`;

/**
 * Who the link opens for, under the sheet's title (Recipes-Page 07, 08). A
 * friends-only recipe opens for its author's friends, so someone sharing
 * another person's recipe is told whose friends (F-108).
 */
export const recipeShareSubtitle = (
  privacy: string | undefined,
  {
    isOwner = true,
    authorName,
  }: { isOwner?: boolean; authorName?: string | null } = {},
): string => {
  if (privacy !== "FRIENDS") return "Share · anyone with the link";
  if (isOwner) return "Share · your friends can open it";
  const whose =
    authorName != null && authorName.trim() !== ""
      ? `${authorName.trim()}’s`
      : "the author’s";
  return `Share · ${whose} friends can open it`;
};

/** A recipe's shared page: L2's `/share/recipes/<id>`, public when the recipe is. */
export const recipeShareUrl = (origin: string, recipeId: string): string =>
  absoluteUrl(origin, canonicalPath({ kind: "recipe", id: recipeId }));

const noop = () => () => {};

/** The page's origin, after hydration (none on the server). */
function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
}

/**
 * A recipe's Share in the page's More menu (X17). It opens the recipe share
 * sheet; on a recipe nobody else may open (private, or a draft: X15 / D22)
 * it says how to make it shareable instead of handing out a link that 404s
 * for everyone else (`recipeShareBlock`).
 */
export function useRecipeShareItem({
  privacy = "PUBLIC",
  isDraft = false,
  isOwner = false,
  onOpen,
}: {
  privacy?: string;
  isDraft?: boolean;
  isOwner?: boolean;
  /** Opens the share sheet. */
  onOpen: () => void;
}): AppBarOverflowItem {
  const onSelect = useCallback(() => {
    const blocked = recipeShareBlock(privacy, isDraft, isOwner);
    if (blocked !== null) {
      notify(blocked.message, { description: blocked.description });
      return;
    }
    onOpen();
  }, [privacy, isDraft, isOwner, onOpen]);
  return { label: "Share", onSelect };
}

/**
 * The recipe share sheet (L14, L34): F2a's ShareSheet with a real QR code
 * for the recipe's shared page, then Copy link, and More ways where the
 * system has a share sheet.
 */
export function RecipeShareSheet({
  open,
  onOpenChange,
  recipeId,
  recipeName,
  privacy,
  isOwner = true,
  authorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeName: string;
  privacy?: string;
  /** Whether the viewer wrote it: "your friends" only for the author. */
  isOwner?: boolean;
  authorName?: string | null;
}) {
  const origin = useOrigin();
  return (
    <ShareSheet
      open={open}
      onOpenChange={onOpenChange}
      title={recipeName}
      subtitle={recipeShareSubtitle(privacy, { isOwner, authorName })}
      url={recipeShareUrl(origin, recipeId)}
    />
  );
}
