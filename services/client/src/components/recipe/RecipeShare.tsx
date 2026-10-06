"use client";

import { Button, Card, CardContent, Stack, Typography } from "@mui/joy";
import { MdShare } from "react-icons/md";

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
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography level="title-sm">Share Recipe</Typography>
          <Button
            startDecorator={<MdShare />}
            variant="outlined"
            onClick={handleShare}
            size="sm"
          >
            Share
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
