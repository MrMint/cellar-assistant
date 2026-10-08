import type { AppIcon } from "@/components/app/icons";
import { ChevronRight, Recipe, Store } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  brandRows,
  CATALOG_SECTION_SIZE,
  type CatalogRow,
  recipeRows,
  SearchBrandsQuery,
  SearchRecipeGroupsQuery,
  seeAllHref,
} from "./catalog-sections";

/** One section: up to three rows, and "See all" when there are more. */
export function CatalogSection({
  label,
  icon: Icon,
  rows,
  total,
  seeAll,
}: {
  label: string;
  icon: AppIcon;
  rows: readonly CatalogRow[];
  total: number | null;
  seeAll: string;
}) {
  if (rows.length === 0) return null;
  const more = total === null || total > rows.length;
  return (
    <InsetSection
      label={label}
      action={
        more ? (
          <Link
            href={seeAll}
            underline="none"
            className="type-callout relative font-medium text-ink-2 after:absolute after:-inset-y-3 after:-inset-x-2 after:content-['']"
          >
            See all
            <span className="sr-only"> {label.toLowerCase()}</span>
          </Link>
        ) : undefined
      }
    >
      {rows.map((row) => (
        <ListRow
          key={row.id}
          leading={<Icon aria-hidden className="size-5" strokeWidth={1.75} />}
          title={
            <Link
              href={row.href}
              overlay
              underline="none"
              className="text-ink-1"
            >
              {row.title}
            </Link>
          }
          description={row.description}
          trailing={
            <ChevronRight aria-hidden className="size-5" strokeWidth={1.75} />
          }
        />
      ))}
    </InsetSection>
  );
}

/**
 * Recipes and Brands under the item results of a text search (D1): neither
 * is in the nav any more, so search is one of the ways in (with the Cellar
 * tab's Bar for recipes, and item pages for brands).
 *
 * Each half reads and fails on its own; a failure, or no match, is simply no
 * section — the item results above are the answer to the search, these are
 * extra.
 */
export async function ServerCatalogSections({ query }: { query: string }) {
  const variables = { term: query, first: CATALOG_SECTION_SIZE };
  const [recipes, brands] = await Promise.all([
    apiServerQuery(SearchRecipeGroupsQuery, variables).catch(() => undefined),
    apiServerQuery(SearchBrandsQuery, variables).catch(() => undefined),
  ]);
  const recipeTotal =
    recipes?.recipeGroups.__typename === "RecipeGroupConnection"
      ? (recipes.recipeGroups.totalCount ?? null)
      : null;
  const brandTotal =
    brands?.brandSearch.__typename === "BrandSearchConnection"
      ? (brands.brandSearch.totalCount ?? null)
      : null;
  return (
    <>
      <CatalogSection
        label="Recipes"
        icon={Recipe}
        rows={recipeRows(recipes)}
        total={recipeTotal}
        seeAll={seeAllHref("recipes", query)}
      />
      <CatalogSection
        label="Brands"
        icon={Store}
        rows={brandRows(brands)}
        total={brandTotal}
        seeAll={seeAllHref("brands", query)}
      />
    </>
  );
}
