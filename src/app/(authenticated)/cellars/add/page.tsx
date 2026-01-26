import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { AddCellarClient } from "@/components/cellar/AddCellarClient";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function AddCellar() {
  // Pre-fetch enum data
  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(["permission"], await createEnumQueryFn()),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      <AddCellarClient userId={userId} />
    </EnumProvider>
  );
}
