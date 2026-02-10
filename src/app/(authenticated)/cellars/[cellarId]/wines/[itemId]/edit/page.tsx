import { getMultipleEnumOptions } from "@/lib/enums/server";
import { notFound } from "next/navigation";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { GetWineEditQuery } from "@/components/wine/fragments";
import { WineForm } from "@/components/wine/WineForm";
import { createEnumQueryFn, serverQuery } from "@/lib/urql/server";

export default async function EditWine({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  // Pre-fetch enum data and wine data in parallel
  const [data, enumData] = await Promise.all([
    serverQuery(GetWineEditQuery, { itemId }),
    getMultipleEnumOptions(
      ["wineStyle", "wineVariety", "country"],
      await createEnumQueryFn(),
    ),
  ]);

  if (!data.wines_by_pk) {
    notFound();
  }

  const wine = data.wines_by_pk;

  return (
    <EnumProvider serverEnumData={enumData}>
      <WineForm
        id={itemId}
        onCreated={() => {}}
        defaultValues={{
          name: wine.name,
          description: wine.description ?? undefined,
          vintage: wine.vintage ?? undefined,
          alcohol_content_percentage:
            wine.alcohol_content_percentage?.toString() ?? "",
          barcode_code: wine.barcode_code ?? undefined,
          region: wine.region ?? undefined,
          country: wine.country ?? undefined,
          special_designation: wine.special_designation ?? undefined,
          variety: wine.variety ?? undefined,
          style: wine.style ?? undefined,
          vineyard_designation: wine.vineyard_designation ?? undefined,
        }}
      />
    </EnumProvider>
  );
}
