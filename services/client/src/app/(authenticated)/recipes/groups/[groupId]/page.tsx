import { Alert, Box, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Link } from "@/components/common/Link";
import { RecipeGroupPageQuery } from "@/components/recipe/queries";
import { RecipePage } from "@/components/recipe/RecipePage";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes/groups/[groupId]` — `82450ad1:src/app/(authenticated)/recipes/groups/[groupId]/page.tsx`,
 * restored: the group's name and description, "Showing community's preferred
 * version • View all N versions", and the canonical version as
 * `RecipeDetails`. In production it threw on load.
 *
 * Two fixes the inventory recorded (§7):
 *
 * - "View all N versions" goes to `/recipes/groups/{id}/versions`; the old
 *   link was `/recipes/{groupId}/versions`, a 404.
 * - "No canonical" is not a data error. `canonicalRecipeId` is derived from
 *   votes, so a group nobody has voted on has none. The old page printed
 *   "This recipe group has no canonical recipe. This indicates a data
 *   issue." Instead the first version — `recipes` is ordered the way the
 *   canonical is chosen — is shown, under a plain note that it is the top
 *   version, not the community's pick (kept from the rewrite).
 */
export const dynamic = "force-dynamic";

export default async function RecipeGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await apiServerQuery(RecipeGroupPageQuery, { groupId });
  const result = unwrapResult(data.recipeGroup, "RecipeGroup");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  const recipeGroup = result.data;
  const versionCount = recipeGroup.recipeCount;
  const canonicalId = recipeGroup.canonicalRecipeId ?? null;
  const shownId = canonicalId ?? recipeGroup.recipes.edges[0]?.node.id ?? null;

  const header = (
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
          {canonicalId === null
            ? "Showing the top version • "
            : "Showing community's preferred version • "}
          <Link
            href={`/recipes/groups/${recipeGroup.id}/versions`}
            underline="always"
          >
            View all {versionCount} versions
          </Link>
        </Typography>
      )}

      {canonicalId === null && versionCount > 1 && (
        <Alert color="neutral" variant="soft" sx={{ mt: 2 }}>
          Nobody has voted yet, so this group has no community pick. Vote on the
          versions page to choose one.
        </Alert>
      )}
    </Box>
  );

  if (shownId === null) {
    return (
      <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
        {header}
        <Typography level="body-lg" sx={{ color: "text.secondary" }}>
          This recipe group has no versions yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <RecipePage recipeId={shownId} header={header} />
    </Box>
  );
}
