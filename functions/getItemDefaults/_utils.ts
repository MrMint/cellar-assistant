import {
  Beer_Defaults_Result,
  Country_Enum,
  Spirit_Defaults_Result,
  Spirit_Type_Enum,
  Wine_Defaults_Result,
  Wine_Style_Enum,
  Wine_Variety_Enum,
  Beer_Style_Enum,
  Coffee_Cultivar_Enum,
  Coffee_Process_Enum,
  Coffee_Species_Enum,
  Coffee_Roast_Level_Enum,
  Coffee_Defaults_Result,
} from "@shared/gql/graphql";
import { extract } from "fuzzball";
import { defaultTo, filter, is, isNotNil, nth, pipe } from "ramda";
import { getEnumValues } from "../_utils";

export const beerStyleValues = getEnumValues(Beer_Style_Enum);
export const wineStyleValues = getEnumValues(Wine_Style_Enum);
export const wineVarietyValues = getEnumValues(Wine_Variety_Enum);
export const spiritTypes = getEnumValues(Spirit_Type_Enum);
export const countries = getEnumValues(Country_Enum);
export const coffeeCultivarValues = getEnumValues(Coffee_Cultivar_Enum);
export const coffeeProcessValues = getEnumValues(Coffee_Process_Enum);
export const coffeeSpeciesValues = getEnumValues(Coffee_Species_Enum);
export const coffeeRoastLevelValues = getEnumValues(Coffee_Roast_Level_Enum);

export type ItemType = "BEER" | "WINE" | "SPIRIT" | "COFFEE";

// SharedFields
// TODO experiment with how to avoid the country embed, abbreviations are the problem
const name = "name";
const vintage = `vintage (formatted as "yyyy")`;
const country = `country (one of ${countries.join(", ")})`;
const alcohol_content_percentage =
  "alcohol_content_percentage (ALC % or ABV formatted as decimal xxx.xx)";
const barcode = "barcode (formatted as EAN or UPC code)";

const wineFields = {
  name,
  description:
    "description (an experts creative description of the wines history, tasting notes, pairings, glassware)",
  vintage,
  style: `style (one of [${wineStyleValues.join(", ")}])`,
  winery: "winery",
  region: "region",
  country,
  variety: `variety (one of [${wineVarietyValues.join(", ")}])`,
  alcohol_content_percentage,
  barcode,
  special_designation: "special_designation",
  vineyard_designation: "vineyard_designation",
  estate_bottled: "estate_bottled (formatted as boolean)",
};

const beerFields = {
  name,
  description:
    "description (an experts creative description of the beers history, tasting notes, pairings, glassware)",
  style: `style (one of [${beerStyleValues.join(", ")}])`,
  vintage,
  brewery: "brewery",
  country,
  alcohol_content_percentage,
  international_bitterness_unit:
    "international_bitterness_unit (ibu formatted as decimal)",
  barcode,
};

const spiritFields = {
  name,
  description:
    "description (an experts creative description of the spirits history, tasting notes, pairings, recipes, glassware)",
  type: `type (one of [${spiritTypes.join(", ")}])`,
  style: "style (an example being anejo vs blanco)",
  vintage,
  distillery: "distillery",
  country,
  alcohol_content_percentage,
  barcode,
};

const coffeeFields = {
  name,
  description:
    "description (long description of the coffee beans, tasting notes)",
  roast_level: `roast_level (one of [${coffeeRoastLevelValues.join(", ")}])`,
  process: `process (one of [${coffeeProcessValues.join(", ")}])`,
  species: `species (one of [${coffeeSpeciesValues.join(", ")}])`,
  cultivar: `cultivar (one of [${coffeeCultivarValues.join(", ")}])`,
  roaster: "roaster",
  weight: "weight (number of grams as integer)",
  country,
  barcode,
};

const fieldPrompts = {
  WINE: Object.values(wineFields).join(", "),
  BEER: Object.values(beerFields).join(", "),
  SPIRIT: Object.values(spiritFields).join(", "),
  COFFEE: Object.values(coffeeFields).join(", "),
};

export const generateDefaultsPrompt = (
  itemType: ItemType,
  labelText: string,
) => `Perform the following tasks for the given text from a ${itemType} label:
    1. Remove the WARNING label
    2. Create a single JSON object with the properties: ${fieldPrompts[itemType]}.
    
    input: ${labelText}
    output:
    `;

const MINIMUM_MATCH_SCORE = 70;

type ExtactionResult = [string, number, number][];
const getTopMatch = pipe(
  (input: ExtactionResult): ExtactionResult =>
    filter((x) => x[1] >= MINIMUM_MATCH_SCORE)(input),
  nth(0),
  defaultTo([]),
  nth(0),
);

function performEnumMatch(prediction: string, enumValues: string[]) {
  let match: string = null;
  if (isNotNil(prediction) && is(String, prediction)) {
    match = getTopMatch(extract(prediction, enumValues)) as string | undefined;
  }
  return match;
}

export function mapJsonToReturnType(
  itemType: ItemType,
  jsonPrediction: any,
):
  | Beer_Defaults_Result
  | Wine_Defaults_Result
  | Spirit_Defaults_Result
  | Coffee_Defaults_Result {
  const country = performEnumMatch(jsonPrediction.country, countries);

  switch (itemType) {
    case "WINE": {
      const style = performEnumMatch(jsonPrediction.style, wineStyleValues);
      const variety = performEnumMatch(
        jsonPrediction.variety,
        wineVarietyValues,
      );

      return {
        __typename: "wine_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        vintage: jsonPrediction.vintage,
        region: jsonPrediction.region,
        alcohol_content_percentage: jsonPrediction.alcohol_content_percentage,
        barcode_code: jsonPrediction.barcode,
        special_designation: jsonPrediction.special_designation,
        vineyard_designation: jsonPrediction.vineyard_designation,
        style,
        variety,
        country,
      } as Wine_Defaults_Result;
    }
    case "BEER": {
      const style = performEnumMatch(jsonPrediction.style, beerStyleValues);
      return {
        __typename: "beer_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        vintage: jsonPrediction.vintage,
        country,
        alcohol_content_percentage: jsonPrediction.alcohol_content_percentage,
        barcode_code: jsonPrediction.barcode,
        style,
        international_bitterness_unit:
          jsonPrediction.international_bitterness_unit,
      } as Beer_Defaults_Result;
    }
    case "SPIRIT": {
      const type = performEnumMatch(jsonPrediction.type, spiritTypes);
      return {
        __typename: "spirit_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        type,
        style: jsonPrediction.style,
        vintage: jsonPrediction.vintage,
        country,
        alcohol_content_percentage: jsonPrediction.alcohol_content_percentage,
        barcode_code: jsonPrediction.barcode,
        distillery: jsonPrediction.distillery,
      } as Spirit_Defaults_Result;
    }
    case "COFFEE": {
      const roast_level = performEnumMatch(
        jsonPrediction.roast_level,
        coffeeRoastLevelValues,
      );
      const species = performEnumMatch(
        jsonPrediction.species,
        coffeeSpeciesValues,
      );
      const cultivar = performEnumMatch(
        jsonPrediction.cultivar,
        coffeeCultivarValues,
      );
      const process = performEnumMatch(
        jsonPrediction.process,
        coffeeProcessValues,
      );
      return {
        __typename: "coffee_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        country,
        roast_level,
        species,
        cultivar,
        process,
        barcode_code: jsonPrediction.barcode,
      } as Coffee_Defaults_Result;
    }
    default:
      throw Error();
  }
}
