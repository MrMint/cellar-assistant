import { graphql } from "@cellar-assistant/shared";
import { Box, CircularProgress, Typography } from "@mui/joy";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  RecipeDetails,
  type RecipeDetailsItem,
} from "@/components/recipe/RecipeDetails";
import { makeServerClient } from "@/lib/urql/server-client";
import { getServerUserId } from "@/utilities/auth-server";

// GraphQL query to get recipe group details
const GetRecipeGroupQuery = graphql(`
  query GetRecipeGroup($groupId: uuid!) {
    recipe_groups_by_pk(id: $groupId) {
      id
      name
      description
      category
      base_spirit
      tags
      image_url
      canonical_recipe_id
      canonical_recipe {
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
        recipe_reviews(order_by: { created_at: desc }) {
          id
          score
          text
          created_at
          user {
            id
            displayName
            avatarUrl
          }
        }
      }
      recipes_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`);

interface RecipeGroupPageProps {
  params: {
    groupId: string;
  };
}

export default async function RecipeGroupPage({
  params,
}: RecipeGroupPageProps) {
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch recipe group data server-side
  const client = makeServerClient();
  const result = await client.query(GetRecipeGroupQuery, {
    groupId: params.groupId,
  });

  if (result.error) {
    console.error("Error fetching recipe group:", result.error);
    throw new Error("Failed to fetch recipe group");
  }

  const recipeGroup = result.data?.recipe_groups_by_pk;

  if (!recipeGroup) {
    notFound();
  }

  // If no canonical recipe, this is a broken state
  if (!recipeGroup.canonical_recipe) {
    return (
      <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
        <Typography level="h1" sx={{ mb: 3 }}>
          {recipeGroup.name}
        </Typography>
        <Typography level="body-lg" sx={{ color: "danger.500" }}>
          This recipe group has no canonical recipe. This indicates a data
          issue.
        </Typography>
      </Box>
    );
  }

  const versionCount = recipeGroup.recipes_aggregate.aggregate?.count || 0;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      {/* Recipe Group Header */}
      <Box sx={{ mb: 4 }}>
        <Typography level="h1" sx={{ mb: 1 }}>
          {recipeGroup.name}
        </Typography>

        {recipeGroup.description && (
          <Typography level="body-lg" sx={{ color: "text.secondary", mb: 2 }}>
            {recipeGroup.description}
          </Typography>
        )}

        {versionCount > 1 && (
          <Typography level="body-md" sx={{ color: "text.secondary" }}>
            Showing community's preferred version •{" "}
            <Typography
              component="a"
              href={`/recipes/${params.groupId}/versions`}
              sx={{ textDecoration: "underline", cursor: "pointer" }}
            >
              View all {versionCount} versions
            </Typography>
          </Typography>
        )}
      </Box>

      {/* Canonical Recipe Details */}
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        }
      >
        {(recipeGroup.canonical_recipe as unknown as RecipeDetailsItem)?.id ? (
          <RecipeDetails
            recipe={recipeGroup.canonical_recipe as unknown as RecipeDetailsItem}
            userId={userId}
            showGroupInfo={false}
            showVotingInfo={versionCount > 1}
          />
        ) : (
          <Typography>No canonical recipe available for this group</Typography>
        )}
      </Suspense>
    </Box>
  );
}
