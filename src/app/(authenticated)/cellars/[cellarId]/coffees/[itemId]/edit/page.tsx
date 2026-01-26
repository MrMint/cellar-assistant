import { getMultipleEnumOptions } from "@cellar-assistant/shared/enums/server";
import { notFound } from "next/navigation";
import { CoffeeForm } from "@/components/coffee/CoffeeForm";
import { GetCoffeeEditQuery } from "@/components/coffee/fragments";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { createEnumQueryFn, serverQuery } from "@/lib/urql/server";

export default async function EditCoffee({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId } = await params;
  // Pre-fetch enum data and coffee data in parallel
  const [data, enumData] = await Promise.all([
    serverQuery(GetCoffeeEditQuery, { itemId }),
    getMultipleEnumOptions(
      [
        "coffeeRoastLevel",
        "coffeeSpecies",
        "coffeeCultivar",
        "coffeeProcess",
        "country",
      ],
      await createEnumQueryFn(),
    ),
  ]);

  if (!data.coffees_by_pk) {
    notFound();
  }

  const coffee = data.coffees_by_pk;

  return (
    <EnumProvider serverEnumData={enumData}>
      <CoffeeForm
        id={itemId}
        onCreated={() => {}}
        defaultValues={{
          name: coffee.name,
          description: coffee.description ?? undefined,
          barcode_code: coffee.barcode_code ?? undefined,
        }}
      />
    </EnumProvider>
  );
}
