import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { EditTierListClient } from "@/components/tier-list/EditTierListClient";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { GetTierListEditQuery } from "@/components/tier-list/queries";
import { createEnumQueryFn, serverQuery } from "@/lib/urql/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ tierListId: string }>;
};

export default async function EditTierListPage({ params }: Props) {
  const { tierListId } = await params;

  const [data, enumData] = await Promise.all([
    serverQuery(GetTierListEditQuery, { id: tierListId }),
    getMultipleEnumOptions(["permission"], await createEnumQueryFn()),
  ]);

  if (!data.tier_lists_by_pk) {
    notFound();
  }

  return (
    <EnumProvider serverEnumData={enumData}>
      <EditTierListClient tierList={data.tier_lists_by_pk} />
    </EnumProvider>
  );
}
