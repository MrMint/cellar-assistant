import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { CoffeeOnboarding } from "@/components/coffee/CoffeeOnboarding";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddCoffee({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  // Pre-fetch enum data
  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(
      [
        "coffeeRoastLevel",
        "coffeeSpecies",
        "coffeeCultivar",
        "coffeeProcess",
        "country",
      ],
      await createEnumQueryFn(),
    ),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <CoffeeOnboarding cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
