import { extract } from "fuzzball";
import { defaultTo, filter, is, isNotNil, nth, pipe } from "ramda";
import {
  Beer_Defaults_Result,
  Country_Enum,
  Spirit_Defaults_Result,
  Spirit_Type_Enum,
  Wine_Defaults_Result,
  Wine_Style_Enum,
  Wine_Variety_Enum,
  Beer_Style_Enum,
} from "../_gql/graphql";
import { getEnumValues } from "../_utils";

export const beerStyleValues = getEnumValues(Beer_Style_Enum);
export const wineStyleValues = getEnumValues(Wine_Style_Enum);
export const wineVarietyValues = getEnumValues(Wine_Variety_Enum);
export const spiritTypes = getEnumValues(Spirit_Type_Enum);
export const countries = getEnumValues(Country_Enum);

export type ItemType = "BEER" | "WINE" | "SPIRIT";

// SharedFields
// TODO experiment with how to avoid the country embed, abbreviations are the problem
const name = "name";
const vintage = `vintage (formatted as "yyyy")`;
const country = `country (one of ${countries.join(", ")})`;
const alcohol_content_percentage =
  "alcohol_content_percentage (ALC % or ABV formatted as decimal)";
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
    "description (an experts creative description of the beers history, tasting notes, pairings, recipes, glassware)",
  type: `type (one of [${spiritTypes}])`,
  style: "style",
  vintage,
  distillery: "distillery",
  country,
  alcohol_content_percentage,
  barcode,
};

const fieldPrompts = {
  WINE: Object.values(wineFields).join(", "),
  BEER: Object.values(beerFields).join(", "),
  SPIRIT: Object.values(spiritFields).join(", "),
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

export function mapJsonToReturnType(
  itemType: ItemType,
  jsonPrediction: any,
): Beer_Defaults_Result | Wine_Defaults_Result | Spirit_Defaults_Result {
  switch (itemType) {
    case "WINE":
      let style: String = null;
      if (isNotNil(jsonPrediction.style) && is(String, jsonPrediction.style)) {
        style = getTopMatch(extract(jsonPrediction.style, wineStyleValues)) as
          | string
          | undefined;
      }

      let variety: string = null;
      if (
        isNotNil(jsonPrediction.variety) &&
        is(String, jsonPrediction.variety)
      ) {
        variety = getTopMatch(
          extract(jsonPrediction.variety, wineVarietyValues),
        ) as string | undefined;
      }

      let country: string = null;
      if (
        isNotNil(jsonPrediction.country) &&
        is(String, jsonPrediction.country)
      ) {
        country = getTopMatch(extract(jsonPrediction.country, countries)) as
          | string
          | undefined;
      }

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
    case "BEER":
      return {
        __typename: "beer_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        vintage: jsonPrediction.vintage,
        country: jsonPrediction.country,
        alcohol_content_percentage: jsonPrediction.alcohol_content_percentage,
        barcode_code: jsonPrediction.barcode,
        style: jsonPrediction.style,
        international_bitterness_unit:
          jsonPrediction.international_bitterness_unit,
      } as Beer_Defaults_Result;
    case "SPIRIT":
      return {
        __typename: "spirit_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        type: jsonPrediction.type,
        style: jsonPrediction.style,
        vintage: jsonPrediction.vintage,
        country: jsonPrediction.county,
        alcohol_content_percentage: jsonPrediction.alcohol_content_percentage,
        barcode_code: jsonPrediction.barcode,
        distillery: jsonPrediction.distillery,
      } as Spirit_Defaults_Result;
    default:
      throw Error();
  }
}
