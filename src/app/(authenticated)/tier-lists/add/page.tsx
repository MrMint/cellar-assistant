import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { AddTierListClient } from "@/components/tier-list/AddTierListClient";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn } from "@/lib/urql/server";

export default async function AddTierListPage() {
  const enumData = await getMultipleEnumOptions(
    ["permission"],
    await createEnumQueryFn(),
  );

  return (
    <EnumProvider serverEnumData={enumData}>
      <AddTierListClient />
    </EnumProvider>
  );
}
