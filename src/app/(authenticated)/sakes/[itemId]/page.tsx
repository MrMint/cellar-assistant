import { GetSakeDetailsQuery } from "@/components/sake/fragments";
import { SakeDetails } from "@/components/sake/SakeDetails";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function SakeDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetSakeDetailsQuery, { itemId, userId });

  if (!data.sakes_by_pk) {
    return <div>Sake not found</div>;
  }

  return <SakeDetails sakeData={data.sakes_by_pk} />;
}
