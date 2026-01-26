import { Typography } from "@mui/joy";
import { CellarWineDetails } from "@/components/wine/CellarWineDetails";
import { GetCellarWineDetailsQuery } from "@/components/wine/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";
import { getCellarItemData } from "../../getCellarItemData";

export default async function CellarWineDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  const userId = await getServerUserId();

  // Fetch cellar item data server-side for breadcrumbs
  const cellarItemData = await getCellarItemData(itemId);

  if (!cellarItemData) {
    return <Typography>Item not found</Typography>;
  }

  // Fetch detailed data server-side for immediate rendering
  const data = await serverQuery(GetCellarWineDetailsQuery, { itemId, userId });

  if (!data.cellar_items_by_pk || !data.user) {
    return <Typography>Item not found</Typography>;
  }

  return (
    <CellarWineDetails
      cellarItem={data.cellar_items_by_pk}
      user={data.user}
      itemId={itemId}
      cellarId={cellarId}
      userId={userId}
      cellarName={cellarItemData.cellar.name}
      itemName={cellarItemData.itemName}
    />
  );
}
