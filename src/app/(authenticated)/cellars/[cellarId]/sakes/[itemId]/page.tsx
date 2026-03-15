import { CellarSakeDetails } from "@/components/sake/CellarSakeDetails";
import { GetCellarSakeDetailsQuery } from "@/components/sake/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function CellarSakeDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetCellarSakeDetailsQuery, { itemId, userId });

  if (!data.cellar_items_by_pk) {
    return <div>Cellar sake item not found</div>;
  }

  if (!data.user) {
    return <div>User not found</div>;
  }

  return (
    <CellarSakeDetails cellarItem={data.cellar_items_by_pk} user={data.user} />
  );
}
