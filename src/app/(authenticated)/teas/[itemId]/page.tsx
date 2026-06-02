import { GetTeaDetailsQuery } from "@/components/tea/fragments";
import { TeaDetails } from "@/components/tea/TeaDetails";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function TeaDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetTeaDetailsQuery, { itemId, userId });

  if (!data.teas_by_pk) {
    return <div>Tea not found</div>;
  }

  return <TeaDetails teaData={data.teas_by_pk} />;
}
