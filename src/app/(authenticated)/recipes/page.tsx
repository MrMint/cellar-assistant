import { Box, Typography } from "@mui/joy";
import { redirect } from "next/navigation";
import { RecipeGroupSearch } from "@/components/search/RecipeGroupSearch";
import { getServerUserId } from "@/utilities/auth-server";

interface RecipesPageProps {
  searchParams: {
    q?: string;
    semantic?: string;
  };
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <Typography level="h1" sx={{ mb: 3 }}>
        Recipe Groups
      </Typography>

      <Typography level="body-lg" sx={{ mb: 4, color: "text.secondary" }}>
        Discover and explore cocktail recipes. Each recipe group shows the
        community's preferred version based on voting, with alternative versions
        available for comparison.
      </Typography>

      <RecipeGroupSearch
        initialQuery={searchParams.q || searchParams.semantic || ""}
      />
    </Box>
  );
}
