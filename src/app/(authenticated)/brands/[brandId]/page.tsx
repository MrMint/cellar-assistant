import { readFragment } from "@cellar-assistant/shared";
import { Box } from "@mui/joy";
import { notFound, redirect } from "next/navigation";
import {
  BrandDetails,
  type BrandDetailsItem,
} from "@/components/brand/BrandDetails";
import { BrandDetailQuery, BrandPlacesQuery } from "@/components/brand/queries";
import { BrandPlacesFragment } from "@/components/shared/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  const data = await serverQuery(BrandDetailQuery, { id: brandId });

  if (!data.brands_by_pk) {
    notFound();
  }

  // `place_brands` isn't tracked in every deployed schema, so fetch it in a
  // separate query and tolerate its absence — render the brand without its
  // places section rather than failing the whole page.
  let placeBrands: unknown[] = [];
  try {
    const placesData = await serverQuery(BrandPlacesQuery, { id: brandId });
    const places = placesData.brands_by_pk
      ? readFragment(BrandPlacesFragment, placesData.brands_by_pk)
      : null;
    placeBrands = places?.place_brands ?? [];
  } catch {
    // Relationship unavailable on this schema — leave places empty.
  }

  // gql.tada masks nested fragment fields at the type level; the runtime object
  // carries everything BrandDetails needs, so cast as the recipe pages do.
  const brand = {
    ...(data.brands_by_pk as unknown as Record<string, unknown>),
    place_brands: placeBrands,
  } as unknown as BrandDetailsItem;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <BrandDetails brand={brand} />
    </Box>
  );
}
