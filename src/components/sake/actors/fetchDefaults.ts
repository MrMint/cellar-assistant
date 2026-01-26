import {
  type Country_Enum,
  graphql,
  type Sake_Category_Enum,
  type Sake_Rice_Variety_Enum,
  type Sake_Serving_Temperature_Enum,
  type Sake_Type_Enum,
} from "@cellar-assistant/shared";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import type {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import { nullsToUndefined } from "@/utilities";
import type { SakeFormDefaultValues } from "../SakeForm";

const getDefaultsQuery = graphql(`
  query GetSakeDefaults($hint: item_defaults_hint!) {
    sake_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      barcode_code
      barcode_type
      item_onboarding_id
      region
      country
      category
      type
      polish_grade
      serving_temperature
      rice_variety
      yeast_strain
      sake_meter_value
      acidity
      amino_acid
      vintage
      confidence
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
      isNil(result.data?.sake_defaults)
    )
      throw Error();

    const sake = nullsToUndefined(result.data.sake_defaults);
    return {
      defaults: {
        name: sake.name,
        description: sake.description,
        vintage: sake.vintage,
        alcohol_content_percentage: sake.alcohol_content_percentage,
        barcode_code: sake.barcode_code,
        barcode_type: sake.barcode_type,
        region: sake.region,
        country: isNotNil(sake.country)
          ? (sake.country as Country_Enum)
          : undefined,
        category: isNotNil(sake.category)
          ? (sake.category as Sake_Category_Enum)
          : undefined,
        type: isNotNil(sake.type) ? (sake.type as Sake_Type_Enum) : undefined,
        serving_temperature: isNotNil(sake.serving_temperature)
          ? (sake.serving_temperature as Sake_Serving_Temperature_Enum)
          : undefined,
        rice_variety: isNotNil(sake.rice_variety)
          ? (sake.rice_variety as Sake_Rice_Variety_Enum)
          : undefined,
        polish_grade: sake.polish_grade,
        yeast_strain: sake.yeast_strain,
        sake_meter_value: sake.sake_meter_value,
        acidity: sake.acidity,
        amino_acid: sake.amino_acid,
      },
      itemOnboardingId: result.data.sake_defaults.item_onboarding_id,
      confidence: result.data.sake_defaults.confidence ?? 0,
    } as unknown as DefaultValuesResult<SakeFormDefaultValues>;
  },
);
