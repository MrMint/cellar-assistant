import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import { graphql } from "@/gql";
import { Country_Enum, Beer_Style_Enum } from "@/gql/graphql";
import { nullsToUndefined } from "@/utilities";
import { BeerFormDefaultValues } from "../BeerForm";

const getDefaultsQuery = graphql(`
  query GetBeerDefaults($hint: item_defaults_hint!) {
    beer_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      barcode_code
      barcode_type
      item_onboarding_id
      country
      vintage
      style
      international_bitterness_unit
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
      isNil(result.data?.beer_defaults)
    )
      throw Error();

    const beer = nullsToUndefined(result.data.beer_defaults);
    return {
      defaults: {
        name: beer.name,
        description: beer.description,
        vintage: beer.vintage,
        alcohol_content_percentage: beer.alcohol_content_percentage,
        barcode_code: beer.barcode_code,
        barcode_type: beer.barcode_type,
        country: isNotNil(beer.country)
          ? (beer.country as Country_Enum)
          : undefined,
        style: isNotNil(beer.style)
          ? (beer.style as Beer_Style_Enum)
          : undefined,
        international_bitterness_unit: beer.international_bitterness_unit,
      },
      itemOnboardingId: result.data.beer_defaults.item_onboarding_id,
    } as DefaultValuesResult<BeerFormDefaultValues>;
  },
);
