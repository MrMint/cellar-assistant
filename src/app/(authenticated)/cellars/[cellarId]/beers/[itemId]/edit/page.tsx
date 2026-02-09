import { getMultipleEnumOptions } from "@/lib/enums/server";
import { notFound } from "next/navigation";
import { BeerForm } from "@/components/beer/BeerForm";
import { GetBeerEditQuery } from "@/components/beer/fragments";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn, serverQuery } from "@/lib/urql/server";

export default async function EditBeer({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  // Pre-fetch enum data and beer data in parallel
  const [data, enumData] = await Promise.all([
    serverQuery(GetBeerEditQuery, { itemId }),
    getMultipleEnumOptions(["beerStyle", "country"], await createEnumQueryFn()),
  ]);

  if (!data.beers_by_pk) {
    notFound();
  }

  const beer = data.beers_by_pk;

  return (
    <EnumProvider serverEnumData={enumData}>
      <BeerForm
        id={itemId}
        onCreated={() => {}}
        defaultValues={{
          name: beer.name,
          description: beer.description ?? undefined,
          style: beer.style ?? undefined,
          vintage: beer.vintage ?? undefined,
          alcohol_content_percentage:
            beer.alcohol_content_percentage?.toString() ?? "",
          barcode_code: beer.barcode_code ?? undefined,
          international_bitterness_unit:
            beer.international_bitterness_unit?.toString() ?? "",
        }}
      />
    </EnumProvider>
  );
}
