import { graphql, type ResultOf, readFragment } from "@cellar-assistant/shared";
import type { BrandCardItem } from "@/components/brand/BrandCard";
import {
  BrandCoreFragment,
  BrandHierarchyFragment,
  BrandItemsFragment,
  BrandPlacesFragment,
} from "@/components/shared/fragments";

/**
 * List brands with aggregated item/place counts for the brands index page.
 * `$search` is an `_ilike` pattern (default `%` = all). Use with BrandCard.
 */
export const BrandsListQuery = graphql(
  `
  query BrandsList($search: String = "%", $limit: Int = 200, $offset: Int = 0) {
    brands(
      where: { name: { _ilike: $search } }
      limit: $limit
      offset: $offset
      order_by: { name: asc }
    ) {
      ...BrandCore
      item_brands_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`,
  [BrandCoreFragment],
);

/**
 * Map a BrandsListQuery result into the flat shape BrandCard expects.
 * Shared by the server page (initial load) and the client search.
 */
export function toBrandCardItems(
  brands: ResultOf<typeof BrandsListQuery>["brands"],
): BrandCardItem[] {
  return brands.map((brand) => {
    const core = readFragment(BrandCoreFragment, brand);
    return {
      id: core.id,
      name: core.name,
      description: core.description,
      logo_url: core.logo_url,
      brand_type: core.brand_type ?? "other",
      parent_brand_id: core.parent_brand_id,
      item_count: brand.item_brands_aggregate.aggregate?.count,
      // place_count omitted: the place_brands relationship isn't reliably
      // tracked across deployments (see BrandPlacesQuery), so it's not queried.
    };
  });
}

/**
 * Fetch a single brand with full details (hierarchy, items, places).
 * Use with the BrandDetails component.
 */
export const BrandDetailQuery = graphql(
  `
  query BrandDetail($id: uuid!) {
    brands_by_pk(id: $id) {
      ...BrandCore
      ...BrandHierarchy
      ...BrandItems
    }
  }
`,
  [BrandCoreFragment, BrandHierarchyFragment, BrandItemsFragment],
);

/**
 * Associated places for a brand, fetched separately from BrandDetailQuery.
 *
 * The `place_brands` relationship is not present in every deployed Hasura
 * schema, so callers run this query defensively and tolerate its failure —
 * rendering the brand without its places section rather than failing the
 * whole detail page.
 */
export const BrandPlacesQuery = graphql(
  `
  query BrandPlaces($id: uuid!) {
    brands_by_pk(id: $id) {
      ...BrandPlaces
    }
  }
`,
  [BrandPlacesFragment],
);

/**
 * Search existing brands by name for the brand picker autocomplete.
 * Returns the minimal fields needed to render an option.
 */
export const SearchBrandsQuery = graphql(`
  query SearchBrands($search: String!, $limit: Int = 10) {
    brands(
      where: { name: { _ilike: $search } }
      limit: $limit
      order_by: { name: asc }
    ) {
      id
      name
      brand_type
      logo_url
    }
  }
`);

/**
 * Create a brand from the client (used when a user types a brand the picker
 * could not find). Requires the `user` insert permission on `brands`.
 */
export const InsertBrandMutation = graphql(`
  mutation InsertBrand($name: String!, $brand_type: brand_types_enum!) {
    insert_brands_one(object: { name: $name, brand_type: $brand_type }) {
      id
      name
    }
  }
`);
