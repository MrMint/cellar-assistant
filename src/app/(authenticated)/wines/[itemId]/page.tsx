import { GetWineDetailsQuery } from "@/components/wine/fragments";
import { WineDetails } from "@/components/wine/WineDetails";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function WineDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetWineDetailsQuery, { itemId, userId });

  if (!data.wines_by_pk) {
    return <div>Wine not found</div>;
  }

  return (
    <WineDetails
      wine={data.wines_by_pk}
      cellars={data.cellars}
      itemId={itemId}
    />
  );
}
