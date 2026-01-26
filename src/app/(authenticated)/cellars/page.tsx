import { Cellars } from "@/components/cellar/Cellars";
import { GetCellarsQuery } from "@/components/cellar/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function CellarsPage() {
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetCellarsQuery, {});

  return <Cellars cellars={data.cellars} userId={userId} />;
}
