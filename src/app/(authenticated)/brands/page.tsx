import { Box, Typography } from "@mui/joy";
import { redirect } from "next/navigation";
import { BrandsListClient } from "@/components/brand/BrandsListClient";
import { BrandsListQuery, toBrandCardItems } from "@/components/brand/queries";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function BrandsPage() {
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  const data = await serverQuery(BrandsListQuery, { limit: 200, offset: 0 });
  const brands = toBrandCardItems(data.brands ?? []);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <Typography level="h1" sx={{ mb: 1 }}>
        Brands
      </Typography>
      <Typography level="body-lg" sx={{ mb: 3, color: "text.secondary" }}>
        Browse the wineries, breweries, distilleries, and other producers behind
        the items in your cellar.
      </Typography>
      <BrandsListClient initialBrands={brands} />
    </Box>
  );
}
