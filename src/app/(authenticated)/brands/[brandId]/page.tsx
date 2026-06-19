import { readFragment } from "@cellar-assistant/shared";
import { Box } from "@mui/joy";
import { notFound, redirect } from "next/navigation";
import {
  BrandDetails,
  type BrandDetailsItem,
} from "@/components/brand/BrandDetails";
import { BrandDetailQuery } from "@/components/brand/queries";
import { BrandFullFragment } from "@/components/shared/fragments";
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

  // gql.tada masks nested fragment fields at the type level; the runtime object
  // contains everything BrandDetails needs, so cast as the recipe pages do.
  const brand = readFragment(BrandFullFragment, data.brands_by_pk);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <BrandDetails brand={brand as unknown as BrandDetailsItem} />
    </Box>
  );
}
