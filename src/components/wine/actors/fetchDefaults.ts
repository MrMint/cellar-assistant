import {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import {
  Country_Enum,
  Wine_Style_Enum,
  Wine_Variety_Enum,
} from "@/gql/graphql";
import { nullsToUndefined } from "@/utilities";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { WineFormDefaultValues } from "../WineForm";
import { graphql } from "@/gql";

const getDefaultsQuery = graphql(`
  query GetWineDefaults($hint: item_defaults_hint!) {
    wine_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      barcode_code
      barcode_type
      item_onboarding_id
      region
      country
      special_designation
      variety
      vineyard_designation
      vintage
      style
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
      isNil(result.data?.wine_defaults)
    )
      throw Error();

    const wine = nullsToUndefined(result.data.wine_defaults);
    return {
      defaults: {
        name: wine.name,
        description: wine.description,
        vintage: wine.vintage,
        alcohol_content_percentage: wine.alcohol_content_percentage,
        barcode_code: wine.barcode_code,
        barcode_type: wine.barcode_type,
        region: wine.region,
        country: isNotNil(wine.country)
          ? (wine.country as Country_Enum)
          : undefined,
        variety: isNotNil(wine.variety)
          ? (wine.variety as Wine_Variety_Enum)
          : undefined,
        style: isNotNil(wine.style)
          ? (wine.style as Wine_Style_Enum)
          : undefined,
        special_designation: wine.special_designation,
        vineyard_designation: wine.vineyard_designation,
      },
      itemOnboardingId: result.data.wine_defaults.item_onboarding_id,
    } as DefaultValuesResult<WineFormDefaultValues>;
  },
);
