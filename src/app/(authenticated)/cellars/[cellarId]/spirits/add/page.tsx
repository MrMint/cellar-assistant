import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { SpiritOnboarding } from "@/components/spirit/SpiritOnboarding";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddSpirit({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  // Pre-fetch enum data
  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(
      ["spiritType", "country"],
      await createEnumQueryFn(),
    ),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <SpiritOnboarding cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
