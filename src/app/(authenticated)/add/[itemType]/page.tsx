import { notFound } from "next/navigation";
import type { EnumKey } from "@cellar-assistant/shared/enums/registry";
import { BeerOnboarding } from "@/components/beer/BeerOnboarding";
import { CoffeeOnboarding } from "@/components/coffee/CoffeeOnboarding";
import { EnumProvider } from "@/components/providers/EnumProvider";
import { SakeOnboarding } from "@/components/sake/SakeOnboarding";
import { SpiritOnboarding } from "@/components/spirit/SpiritOnboarding";
import { WineOnboarding } from "@/components/wine/WineOnboarding";
import { getMultipleEnumOptions } from "@/lib/enums/server";
import { createEnumQueryFn } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

const VALID_TYPES = ["wines", "beers", "spirits", "coffees", "sakes"] as const;
type ValidItemType = (typeof VALID_TYPES)[number];

const ENUM_MAP: Record<ValidItemType, readonly EnumKey[]> = {
  wines: ["wineStyle", "wineVariety", "country"],
  beers: ["beerStyle", "country"],
  spirits: ["spiritType", "country"],
  coffees: [
    "coffeeRoastLevel",
    "coffeeSpecies",
    "coffeeCultivar",
    "coffeeProcess",
    "country",
  ],
  sakes: [
    "sakeCategory",
    "sakeType",
    "sakeServingTemperature",
    "sakeRiceVariety",
    "country",
  ],
};

function isValidItemType(type: string): type is ValidItemType {
  return (VALID_TYPES as readonly string[]).includes(type);
}

export default async function AddItemTypePage({
  params,
}: {
  params: Promise<{ itemType: string }>;
}) {
  const { itemType } = await params;

  if (!isValidItemType(itemType)) {
    notFound();
  }

  const enumKeys = ENUM_MAP[itemType];

  const [userId, enumData] = await Promise.all([
    getServerUserId(),
    getMultipleEnumOptions(enumKeys, await createEnumQueryFn()),
  ]);

  return (
    <EnumProvider serverEnumData={enumData}>
      {itemType === "wines" && <WineOnboarding userId={userId} />}
      {itemType === "beers" && <BeerOnboarding userId={userId} />}
      {itemType === "spirits" && <SpiritOnboarding userId={userId} />}
      {itemType === "coffees" && <CoffeeOnboarding userId={userId} />}
      {itemType === "sakes" && <SakeOnboarding userId={userId} />}
    </EnumProvider>
  );
}
