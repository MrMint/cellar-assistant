import { CellarTeaDetails } from "@/components/tea/CellarTeaDetails";
import { GetCellarTeaDetailsQuery } from "@/components/tea/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function CellarTeaDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetCellarTeaDetailsQuery, { itemId, userId });

  if (!data.cellar_items_by_pk) {
    return <div>Cellar tea item not found</div>;
  }

  if (!data.user) {
    return <div>User not found</div>;
  }

  return (
    <CellarTeaDetails cellarItem={data.cellar_items_by_pk} user={data.user} />
  );
}
