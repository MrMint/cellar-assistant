import { getMultipleEnumOptions } from "@/lib/enums/server";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { WineOnboarding } from "@/components/wine/WineOnboarding";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddWine({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  // Pre-fetch enum data
  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(
      ["wineStyle", "wineVariety", "country"],
      await createEnumQueryFn(),
    ),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <WineOnboarding cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
