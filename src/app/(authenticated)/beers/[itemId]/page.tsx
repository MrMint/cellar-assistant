import { BeerDetails } from "@/components/beer/BeerDetails";
import { GetBeerDetailsQuery } from "@/components/beer/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function BeerDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetBeerDetailsQuery, { itemId, userId });

  if (!data.beers_by_pk) {
    return <div>Beer not found</div>;
  }

  return (
    <BeerDetails
      beer={data.beers_by_pk}
      cellars={data.cellars}
      itemId={itemId}
    />
  );
}
