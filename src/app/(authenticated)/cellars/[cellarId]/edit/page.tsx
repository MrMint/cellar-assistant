import { getMultipleEnumOptions } from "@/lib/enums/server";
import { notFound } from "next/navigation";
import { EditCellarClient } from "@/components/cellar/EditCellarClient";
import { GetCellarEditQuery } from "@/components/cellar/fragments";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn, serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function EditCellar({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  // Pre-fetch enum data, user data, and cellar data in parallel
  const [userId, data, enumData] = await Promise.all([
    getServerUserId(),
    serverQuery(GetCellarEditQuery, { cellarId }),
    getMultipleEnumOptions(["permission"], await createEnumQueryFn()),
  ]);

  if (!data.cellars_by_pk) {
    notFound();
  }

  return (
    <EnumProvider serverEnumData={enumData}>
      <EditCellarClient cellarId={cellarId} userId={userId} />
    </EnumProvider>
  );
}
