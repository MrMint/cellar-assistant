import { GetSpiritDetailsQuery } from "@/components/spirit/fragments";
import { SpiritDetails } from "@/components/spirit/SpiritDetails";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function SpiritDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetSpiritDetailsQuery, { itemId, userId });

  if (!data.spirits_by_pk) {
    return <div>Spirit not found</div>;
  }

  return (
    <SpiritDetails
      spirit={data.spirits_by_pk}
      cellars={data.cellars}
      itemId={itemId}
    />
  );
}
