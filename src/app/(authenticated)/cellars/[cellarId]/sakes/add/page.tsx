import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { SakeOnboarding } from "@/components/sake/SakeOnboarding";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddSakePage({
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
        "sakeCategory",
        "sakeType",
        "sakeServingTemperature",
        "sakeRiceVariety",
        "country",
      ],
      await createEnumQueryFn(),
    ),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <SakeOnboarding cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
