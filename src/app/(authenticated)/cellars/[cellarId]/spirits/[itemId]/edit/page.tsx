import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { notFound } from "next/navigation";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { GetSpiritEditQuery } from "@/components/spirit/fragments";
import { SpiritForm } from "@/components/spirit/SpiritForm";
import { createEnumQueryFn, serverQuery } from "@/lib/urql/server";

export default async function EditSpirit({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  // Pre-fetch enum data and spirit data in parallel
  const [data, enumData] = await Promise.all([
    serverQuery(GetSpiritEditQuery, { itemId }),
    getMultipleEnumOptions(
      ["spiritType", "country"],
      await createEnumQueryFn(),
    ),
  ]);

  if (!data.spirits_by_pk) {
    notFound();
  }

  const spirit = data.spirits_by_pk;

  return (
    <EnumProvider serverEnumData={enumData}>
      <SpiritForm
        id={itemId}
        onCreated={() => {}}
        defaultValues={{
          name: spirit.name,
          description: spirit.description ?? undefined,
          style: spirit.style ?? undefined,
          vintage: spirit.vintage ?? undefined,
          type: spirit.type ?? undefined,
          alcohol_content_percentage:
            spirit.alcohol_content_percentage?.toString() ?? "",
          barcode_code: spirit.barcode_code ?? undefined,
        }}
      />
    </EnumProvider>
  );
}
