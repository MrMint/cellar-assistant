import {
  type Country_Enum,
  graphql,
  type Spirit_Type_Enum,
} from "@cellar-assistant/shared";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import type {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import { nullsToUndefined } from "@/utilities";
import type { SpiritFormDefaultValues } from "../SpiritForm";

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
      confidence
      brand_id
      brand_name
      is_new_brand
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
        brand_id: spirit.brand_id,
        brand_name: spirit.brand_name,
        is_new_brand: spirit.is_new_brand,
      },
      itemOnboardingId: result.data.spirit_defaults.item_onboarding_id,
      confidence: result.data.spirit_defaults.confidence ?? 0,
    } as DefaultValuesResult<SpiritFormDefaultValues>;
  },
);
