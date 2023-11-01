import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import { graphql } from "@/gql";
import { Country_Enum, Spirit_Type_Enum } from "@/gql/graphql";
import { nullsToUndefined } from "@/utilities";
import { SpiritFormDefaultValues } from "../SpiritForm";

const getDefaultsQuery = graphql(`
  query GetSpiritDefaults($hint: item_defaults_hint!) {
    spirit_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      barcode_code
      barcode_type
      item_onboarding_id
      country
      vintage
      style
      type
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
      isNil(result.data?.spirit_defaults)
    )
      throw Error();

    const spirit = nullsToUndefined(result.data.spirit_defaults);
    return {
      defaults: {
        name: spirit.name,
        description: spirit.description,
        vintage: spirit.vintage,
        alcohol_content_percentage: spirit.alcohol_content_percentage,
        barcode_code: spirit.barcode_code,
        barcode_type: spirit.barcode_type,
        style: spirit.style,
        country: isNotNil(spirit.country)
          ? (spirit.country as Country_Enum)
          : undefined,
        type: isNotNil(spirit.type)
          ? (spirit.type as Spirit_Type_Enum)
          : undefined,
      },
      itemOnboardingId: result.data.spirit_defaults.item_onboarding_id,
    } as DefaultValuesResult<SpiritFormDefaultValues>;
  },
);
