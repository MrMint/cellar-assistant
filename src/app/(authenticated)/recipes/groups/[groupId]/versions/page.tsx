import { graphql } from "@cellar-assistant/shared";
import { Box, CircularProgress, Typography } from "@mui/joy";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  type RecipeVersionData,
  RecipeVersionsTab,
} from "@/components/recipe/RecipeVersionsTab";
import { makeServerClient } from "@/lib/urql/server-client";
import { getServerUserId } from "@/utilities/auth-server";

// GraphQL query to get all recipe versions in a group
const GetRecipeVersionsQuery = graphql(`
  query GetRecipeVersions($groupId: uuid!) {
    recipe_groups_by_pk(id: $groupId) {
      id
      name
      description
      category
      base_spirit
      canonical_recipe_id
      recipes(order_by: {created_at: asc}) {
        id
        name
        description
        type
        difficulty_level
        prep_time_minutes
        serving_size
        image_url
        version
        created_at
        created_by
        created_by_user {
          id
          displayName
          avatarUrl
        }
        ingredients {
          id
          quantity
          unit
          is_optional
          substitution_notes
          wine_id
          beer_id
          spirit_id
          coffee_id
          generic_item_id
          wine {
            id
            name
            vintage
            style
          }
          beer {
            id
            name
            style
          }
          spirit {
            id
            name
            type
          }
          coffee {
            id
            name
            roast_level
          }
          generic_item {
            id
            name
            category
            subcategory
            item_type
          }
        }
        instructions(order_by: { step_number: asc }) {
          id
          step_number
          instruction_text
          instruction_type
          equipment_needed
          time_minutes
        }
        votes_aggregate {
          aggregate {
            count
          }
        }
        votes_aggregate(where: {vote_type: {_eq: "upvote"}}) {
          aggregate {
            count
          }
        }
        votes_aggregate(where: {vote_type: {_eq: "downvote"}}) {
          aggregate {
            count
          }
        }
        votes(where: {user_id: {_eq: "X-Hasura-User-Id"}}) {
          id
          vote_type
        }
      }
    }
  }
`);

interface RecipeVersionsPageProps {
  params: {
    groupId: string;
  };
}

export default async function RecipeVersionsPage({
  params,
}: RecipeVersionsPageProps) {
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch recipe group data server-side
  const client = makeServerClient();
  const result = await client.query(GetRecipeVersionsQuery, {
    groupId: params.groupId,
  });

  if (result.error) {
    console.error("Error fetching recipe versions:", result.error);
    throw new Error("Failed to fetch recipe versions");
  }

  const recipeGroup = result.data?.recipe_groups_by_pk;

  if (!recipeGroup) {
    notFound();
  }

  const recipes = (recipeGroup.recipes || []).map((recipe) => ({
    ...recipe,
    created_at: recipe.created_at || new Date().toISOString(),
  })) as RecipeVersionData[];
  const canonicalRecipeId = recipeGroup.canonical_recipe_id;

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography level="body-sm" sx={{ mb: 1 }}>
          <Link href="/recipes" style={{ textDecoration: "underline" }}>
            Recipe Groups
          </Link>
          {" > "}
          <Link
            href={`/recipes/${params.groupId}`}
            style={{ textDecoration: "underline" }}
          >
            {recipeGroup.name}
          </Link>
          {" > Versions"}
        </Typography>

        <Typography level="h1" sx={{ mb: 1 }}>
          {recipeGroup.name} - All Versions
        </Typography>

        {recipeGroup.description && (
          <Typography level="body-lg" sx={{ color: "text.secondary", mb: 2 }}>
            {recipeGroup.description}
          </Typography>
        )}

        <Typography level="body-md" sx={{ color: "text.secondary" }}>
          Compare all {recipes.length} versions of this recipe and vote for your
          favorite. The community's preferred version is shown as the canonical
          recipe.
        </Typography>
      </Box>

      {/* Recipe Versions Comparison */}
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        }
      >
        <RecipeVersionsTab
          recipes={recipes}
          canonicalRecipeId={canonicalRecipeId}
          groupId={params.groupId}
        />
      </Suspense>
    </Box>
  );
}
