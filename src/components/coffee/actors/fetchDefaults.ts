import { graphql } from "@shared/gql";
import {
  Coffee_Roast_Level_Enum,
  Coffee_Process_Enum,
  Coffee_Species_Enum,
  Coffee_Cultivar_Enum,
} from "@shared/gql/graphql";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import { nullsToUndefined } from "@/utilities";
import { CoffeeFormDefaultValues } from "../CoffeeForm";

const getDefaultsQuery = graphql(`
  query GetCoffeeDefaults($hint: item_defaults_hint!) {
    coffee_defaults(hint: $hint) {
      name
      description
      barcode_code
      barcode_type
      item_onboarding_id
      country
      roast_level
      cultivar
      process
      species
    }
  }
`);

export const fetchDefaults = fromPromise(
  async ({
    input: { urqlClient, barcode, frontLabelFileId, backLabelFileId },
  }: {
    input: FetchDefaultsInput;
  }): Promise<DefaultValuesResult<DefaultValues>> => {
    const result = await urqlClient.query(getDefaultsQuery, {
      hint: {
        barcode: barcode?.text,
        barcodeType: barcode?.type,
        frontLabelFileId,
        backLabelFileId,
      },
    });
    if (
      isNil(result) ||
      isNil(result.data) ||
      isNil(result.data?.coffee_defaults)
    )
      throw Error();

    const coffee = nullsToUndefined(result.data.coffee_defaults);
    return {
      defaults: {
        name: coffee.name,
        description: coffee.description,
        barcode_code: coffee.barcode_code,
        barcode_type: coffee.barcode_type,
        roast_level: isNotNil(coffee.roast_level)
          ? (coffee.roast_level as Coffee_Roast_Level_Enum)
          : undefined,
        process: isNotNil(coffee.process)
          ? (coffee.process as Coffee_Process_Enum)
          : undefined,
        species: isNotNil(coffee.species)
          ? (coffee.species as Coffee_Species_Enum)
          : undefined,
        cultivar: isNotNil(coffee.cultivar)
          ? (coffee.cultivar as Coffee_Cultivar_Enum)
          : undefined,
      },
      itemOnboardingId: result.data.coffee_defaults.item_onboarding_id,
    } as DefaultValuesResult<CoffeeFormDefaultValues>;
  },
);
