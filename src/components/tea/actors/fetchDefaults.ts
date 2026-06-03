import {
  type Country_Enum,
  graphql,
  type Tea_Caffeine_Level_Enum,
  type Tea_Category_Enum,
  type Tea_Form_Enum,
} from "@cellar-assistant/shared";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import type {
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
} from "@/components/common/OnboardingWizard/actors/types";
import { nullsToUndefined } from "@/utilities";
import type { TeaFormDefaultValues } from "../TeaForm";

const getDefaultsQuery = graphql(`
  query GetTeaDefaults($hint: item_defaults_hint!) {
    tea_defaults(hint: $hint) {
      name
      description
      barcode_code
      barcode_type
      item_onboarding_id
      region
      country
      category
      form
      caffeine_level
      cultivar
      oxidation_level
      processing
      harvest_year
      ingredients
      steeping_temperature
      steeping_time
      flavor_profile
      is_organic
      is_fair_trade
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
    if (isNil(result) || isNil(result.data) || isNil(result.data?.tea_defaults))
      throw Error();

    const tea = nullsToUndefined(result.data.tea_defaults);
    return {
      defaults: {
        name: tea.name,
        description: tea.description,
        harvest_year: isNotNil(tea.harvest_year)
          ? String(tea.harvest_year)
          : undefined,
        barcode_code: tea.barcode_code,
        barcode_type: tea.barcode_type,
        region: tea.region,
        country: isNotNil(tea.country)
          ? (tea.country as Country_Enum)
          : undefined,
        category: isNotNil(tea.category)
          ? (tea.category as Tea_Category_Enum)
          : undefined,
        form: isNotNil(tea.form) ? (tea.form as Tea_Form_Enum) : undefined,
        caffeine_level: isNotNil(tea.caffeine_level)
          ? (tea.caffeine_level as Tea_Caffeine_Level_Enum)
          : undefined,
        cultivar: tea.cultivar,
        oxidation_level: tea.oxidation_level,
        processing: tea.processing,
        ingredients: tea.ingredients,
        steeping_temperature: tea.steeping_temperature,
        steeping_time: tea.steeping_time,
        flavor_profile: tea.flavor_profile,
        is_organic: tea.is_organic,
        is_fair_trade: tea.is_fair_trade,
        brand_id: tea.brand_id,
        brand_name: tea.brand_name,
        is_new_brand: tea.is_new_brand,
      },
      itemOnboardingId: result.data.tea_defaults.item_onboarding_id,
      confidence: result.data.tea_defaults.confidence ?? 0,
    } as unknown as DefaultValuesResult<TeaFormDefaultValues>;
  },
);
