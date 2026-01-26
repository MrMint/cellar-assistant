import { Stack, Typography } from "@mui/joy";
import { HeaderBar } from "@/components/common/HeaderBar";

interface RecipeHeaderServerProps {
  recipeId: string;
  recipeName: string;
  recipeType: "food" | "cocktail";
}

export function RecipeHeaderServer({
  recipeId,
  recipeName,
  recipeType,
}: RecipeHeaderServerProps) {
  return (
    <HeaderBar
      serverBreadcrumbs={{
        recipeName,
      }}
      endComponent={
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography
            level="body-sm"
            sx={{ color: "text.secondary", textTransform: "capitalize" }}
          >
            {recipeType}
          </Typography>
        </Stack>
      }
    />
  );
}
