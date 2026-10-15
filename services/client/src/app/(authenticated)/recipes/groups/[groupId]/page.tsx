import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Link } from "@/components/app/Link";
import { RecipeGroupPageQuery } from "@/components/recipe/queries";
import { RecipePage } from "@/components/recipe/RecipePage";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

/** One group read per request, for the page and its title (X21). */
const loadRecipeGroup = cache((groupId: string) =>
  apiServerQuery(RecipeGroupPageQuery, { groupId }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;
  const result = unwrapResult(
    (await loadRecipeGroup(groupId)).recipeGroup,
    "RecipeGroup",
  );
  return { title: result.ok ? result.data.name : "Recipe" };
}

export default async function RecipeGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await loadRecipeGroup(groupId);
  const result = unwrapResult(data.recipeGroup, "RecipeGroup");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <p className="type-body text-destructive">{result.error.message}</p>;
  }

  const recipeGroup = result.data;
  const versionCount = recipeGroup.recipeCount;
  const canonicalId = recipeGroup.canonicalRecipeId ?? null;
  const shownId = canonicalId ?? recipeGroup.recipes.edges[0]?.node.id ?? null;

  const header = (
    <div className="mb-8">
      <h1 className="mb-2 type-large-title">{recipeGroup.name}</h1>

      {recipeGroup.description && (
        <p className="mb-4 type-body text-ink-2">{recipeGroup.description}</p>
      )}

      {versionCount > 1 && (
        <p className="type-body text-ink-2">
          {canonicalId === null
            ? "Showing the top version • "
            : "Showing community's preferred version • "}
          <Link
            href={`/recipes/groups/${recipeGroup.id}/versions`}
            underline="always"
            className="text-ink-1"
          >
            View all {versionCount} versions
          </Link>
        </p>
      )}

      {canonicalId === null && versionCount > 1 && (
        <Alert className="mt-4 border-none bg-surface-2">
          <AlertDescription className="text-ink-1">
            Nobody has voted yet, so this group has no community pick. Vote on
            the versions page to choose one.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  if (shownId === null) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        {header}
        <p className="type-body text-ink-2">
          This recipe group has no versions yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <RecipePage recipeId={shownId} header={header} />
    </div>
  );
}
