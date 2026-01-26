import { CoffeeDetails } from "@/components/coffee/CoffeeDetails";
import { GetCoffeeDetailsQuery } from "@/components/coffee/fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function CoffeeDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  const userId = await getServerUserId();

  // Fetch data server-side for immediate rendering
  const data = await serverQuery(GetCoffeeDetailsQuery, { itemId, userId });

  if (!data.coffees_by_pk) {
    throw new Error("Coffee not found");
  }

  return (
    <CoffeeDetails
      coffee={data.coffees_by_pk}
      cellars={data.cellars}
      itemId={itemId}
    />
  );
}
