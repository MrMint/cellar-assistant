import { Typography } from "@mui/joy";
import { redirect } from "next/navigation";
import { CellarItems } from "@/components/cellar/CellarItems";
import { GetCellarInfoQuery } from "@/components/cellar/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function CellarItemsPage({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch cellar data server-side for immediate rendering
  const data = await serverQuery(GetCellarInfoQuery, { cellarId });

  if (!data.cellars_by_pk) {
    return <Typography>Cellar not found</Typography>;
  }

  return (
    <CellarItems
      cellarInfo={data.cellars_by_pk}
      cellarId={cellarId}
      userId={userId}
    />
  );
}
