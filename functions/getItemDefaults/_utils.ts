import {
  Beer_Defaults_Result,
  Spirit_Defaults_Result,
  Wine_Defaults_Result,
} from "../_gql/graphql";

export type ItemType = "BEER" | "WINE" | "SPIRIT";

// TODO query db for enum'd types
const spiritTypes = "VODKA, BOURBON, TEQUILA, RUM, GIN, WHISKEY";
export function getFieldsForType(itemType: ItemType) {
  switch (itemType) {
    case "WINE":
      return `name, description(an experts creative description of the wines history, tasting notes, pairings, glassware), type(one of [red, white]), vintage (formatted as "yyyy"), winery, region, country, variety, alcohol_content_percentage (abv formatted as decimal), barcode (formatted as UPC or EAN code), special_designation, vineyard_designation, is_estate_brewed(formatted as boolean)`;
    case "BEER":
      return `name, description(an experts creative description of the beers history, tasting notes, pairings, glassware), style(one of [lager, ale, stout, ipa, porter, tripel]), vintage (formatted as "yyyy"), brewery, country, alcohol_content_percentage (abv formatted as decimal), international_bitterness_unit (ibu formatted as decimal), barcode (formatted as UPC or EAN code)`;
    case "SPIRIT":
      return `name, description(an experts creative description of the spirits history, tasting notes, pairings, glassware), type(one of [${spiritTypes}]), style, vintage (formatted as "yyyy"), distillery, country, alcohol_content_percentage (abv formatted as decimal), barcode (formatted as UPC or EAN code)`;
    default:
      throw Error();
  }
}

export function mapJsonToReturnType(
  itemType: ItemType,
  jsonPrediction: any,
): Beer_Defaults_Result | Wine_Defaults_Result | Spirit_Defaults_Result {
  switch (itemType) {
    case "WINE":
      return {
        __typename: "wine_defaults_result",
        name: jsonPrediction.name,
        description: jsonPrediction.description,
        variety: jsonPrediction.variety,
        vintage: jsonPrediction.vintage,
        region: jsonPrediction.region,
        alcohol_content_percentage: jsonPrediction.alcohol_content_percentage,
        barcode_code: jsonPrediction.barcode,
        special_designation: jsonPrediction.special_designation,
        vineyard_designation: jsonPrediction.vineyard_designation,
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
