import { EnumProvider } from "@/components/providers/EnumProvider";
import { TeaOnboarding } from "@/components/tea/TeaOnboarding";
import { getMultipleEnumOptions } from "@/lib/enums/server";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddTeaPage({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  // Pre-fetch enum data
  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(
      ["teaCategory", "teaForm", "teaCaffeineLevel", "country"],
      await createEnumQueryFn(),
    ),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <TeaOnboarding cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
