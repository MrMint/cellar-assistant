"use client";

import { Button, Card, CardContent, Stack, Typography } from "@mui/joy";
import { MdShare } from "react-icons/md";

interface RecipeShareProps {
  recipeId: string;
  recipeType: "food" | "cocktail";
}

export function RecipeShare({ recipeId, recipeType }: RecipeShareProps) {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Recipe from Cellar Assistant`,
          text: `Check out this ${recipeType} recipe!`,
          url: window.location.href,
        });
      } catch (error) {
        // User canceled sharing or sharing failed
        console.log("Sharing failed:", error);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // You could add a toast notification here
      } catch (error) {
        console.log("Copy to clipboard failed:", error);
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
