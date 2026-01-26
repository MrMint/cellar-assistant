import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { BeerOnboarding } from "@/components/beer/BeerOnboarding";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddBeer({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  // Pre-fetch enum data
  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(["beerStyle", "country"], await createEnumQueryFn()),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <BeerOnboarding cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
