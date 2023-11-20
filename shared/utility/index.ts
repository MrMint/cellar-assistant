import {
  Beer_Style_Enum,
  Country_Enum,
  Spirit_Type_Enum,
  Wine_Style_Enum,
  Wine_Variety_Enum,
} from "@shared/gql/graphql";

// importing anything from node_modules causes lambda build to fail due to unresolved dep
// TODO investigate monorepo solution
const isNil = (value: any): value is null | undefined =>
  value === null || value === undefined;

export const formatEnum = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  return type
    .toLowerCase()
    .split("_")
    .map((x) => x[0].toUpperCase() + x.substring(1))
    .join(" ");
};

export const formatCountry = (type: Country_Enum | null | undefined) => {
  if (isNil(type)) return undefined;
  return type
    .toLowerCase()
    .split("_")
    .map((x) => x[0].toUpperCase() + x.substring(1))
    .join(" ");
};

export const formatSpiritType = (type: Spirit_Type_Enum) => {
  switch (type) {
    case Spirit_Type_Enum.AmaroAperitifVermouth:
      return "Amaro, Aperitif & Vermouth";
    case Spirit_Type_Enum.Baijiu:
      return "Baijiu";
    case Spirit_Type_Enum.Bourbon:
      return "Bourbon";
    case Spirit_Type_Enum.BrandyCognac:
      return "Brandy & Cognac";
    case Spirit_Type_Enum.Gin:
      return "Gin";
    case Spirit_Type_Enum.Liqueurs:
      return "Liqueurs";
    case Spirit_Type_Enum.Mezcal:
      return "Mezcal";
    case Spirit_Type_Enum.Moonshine:
      return "Moonshine";
    case Spirit_Type_Enum.Rum:
      return "Rum";
    case Spirit_Type_Enum.Scotch:
      return "Scotch";
    case Spirit_Type_Enum.Soju:
      return "Soju";
    case Spirit_Type_Enum.Tequila:
      return "Tequila";
    case Spirit_Type_Enum.Vodka:
      return "Vodka";
    case Spirit_Type_Enum.Whiskey:
      return "Whiskey";
    default:
      return type;
  }
};

export const formatWineVariety = (
  type: Wine_Variety_Enum | null | undefined,
) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case Wine_Variety_Enum.Aglianico:
      return "Aglianico";
    case Wine_Variety_Enum.AlbarinoAlvarinho:
      return "Albariño / Alvarinho";
    case Wine_Variety_Enum.Arneis:
      return "Arneis";
    case Wine_Variety_Enum.Asti:
      return "Asti";
    case Wine_Variety_Enum.Barbera:
      return "Barbera";
    case Wine_Variety_Enum.Blaufrankisch:
      return "Blaufrankisch";
    case Wine_Variety_Enum.Blend:
      return "Blend";
    case Wine_Variety_Enum.CabernetFranc:
      return "Cabernet Franc";
    case Wine_Variety_Enum.CabernetSauvignon:
      return "Cabernet Sauvignon";
    case Wine_Variety_Enum.Carignan:
      return "Carigan";
    case Wine_Variety_Enum.Carmenere:
      return "Carmenère";
    case Wine_Variety_Enum.Cava:
      return "Cava";
    case Wine_Variety_Enum.Champagne:
      return "Champagne";
    case Wine_Variety_Enum.Chardonnay:
      return "Chardonnay";
    case Wine_Variety_Enum.CheninBlanc:
      return "Chenin Blanc";
    case Wine_Variety_Enum.Cinsault:
      return "Cinsault";
    case Wine_Variety_Enum.Corvina:
      return "Corvina";
    case Wine_Variety_Enum.Cremant:
      return "Crémant";
    case Wine_Variety_Enum.Dolcetto:
      return "Dolcetto";
    case Wine_Variety_Enum.Furmint:
      return "Furmint";
    case Wine_Variety_Enum.Gamay:
      return "Gamay";
    case Wine_Variety_Enum.Garganega:
      return "Garganega";
    case Wine_Variety_Enum.Gewurztraminer:
      return "Gewürztraminer";
    case Wine_Variety_Enum.Grenache:
      return "Grenache";
    case Wine_Variety_Enum.GrunerVeltliner:
      return "Grüner Veltliner";
    case Wine_Variety_Enum.Lambrusco:
      return "Lambrusco";
    case Wine_Variety_Enum.Malbec:
      return "Malbec";
    case Wine_Variety_Enum.Malvasia:
      return "Malvasia";
    case Wine_Variety_Enum.Marsanne:
      return "Marsanne";
    case Wine_Variety_Enum.Merlot:
      return "Merlot";
    case Wine_Variety_Enum.MourvedreMonastrell:
      return "Mourvedre/Monastrell";
    case Wine_Variety_Enum.MullerThurgau:
      return "Müller-Thurgau";
    case Wine_Variety_Enum.Muscadet:
      return "Muscadet";
    case Wine_Variety_Enum.Nebbiolo:
      return "Nebbiolo";
    case Wine_Variety_Enum.PetitVerdot:
      return "Petit Verdot";
    case Wine_Variety_Enum.PetiteSirah:
      return "Petite Sirah";
    case Wine_Variety_Enum.PinotBlanc:
      return "Pinot Blanc";
    case Wine_Variety_Enum.PinotGrigioPinotGris:
      return "Pinot Grigio";
    case Wine_Variety_Enum.PinotNoir:
      return "Pinot Noir";
    case Wine_Variety_Enum.Pinotage:
      return "Pinotage";
    case Wine_Variety_Enum.Primitivo:
      return "Primitivo";
    case Wine_Variety_Enum.Prosecco:
      return "Prosecco";
    case Wine_Variety_Enum.RedBlend:
      return "Red Blend";
    case Wine_Variety_Enum.RhoneBlends:
      return "Rhône Blend";
    case Wine_Variety_Enum.Riesling:
      return "Riesling";
    case Wine_Variety_Enum.Roussanne:
      return "Roussanne";
    case Wine_Variety_Enum.Sangiovese:
      return "Snagiovese";
    case Wine_Variety_Enum.SauvignonBlanc:
      return "Sauvignon Blanc";
    case Wine_Variety_Enum.Semillon:
      return "Semillon";
    case Wine_Variety_Enum.SyrahShiraz:
      return "Syrah/Shiraz";
    case Wine_Variety_Enum.Tempranillo:
      return "Tempranillo";
    case Wine_Variety_Enum.Torrontes:
      return "Torrontes";
    case Wine_Variety_Enum.Verdejo:
      return "Verdejo";
    case Wine_Variety_Enum.Viognier:
      return "Viognier";
    case Wine_Variety_Enum.Zinfandel:
      return "Zinfandel";
    default:
      return type;
  }
};
export const formatWineStyle = (type: Wine_Style_Enum) => {
  switch (type) {
    case Wine_Style_Enum.Dessert:
      return "Dessert";
    case Wine_Style_Enum.Red:
      return "Red";
    case Wine_Style_Enum.Rose:
      return "Rosé";
    case Wine_Style_Enum.Sparkling:
      return "Sparkling";
    case Wine_Style_Enum.White:
      return "White";
    default:
      return type;
  }
};

export const formatBeerStyle = (type: Beer_Style_Enum | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case Beer_Style_Enum.Altbier:
      return "Altbier";
    case Beer_Style_Enum.AmberAle:
      return "Amber Ale";
    case Beer_Style_Enum.BarleyWine:
      return "Barley Wine";
    case Beer_Style_Enum.BerlinerWeisse:
      return "Berliner Weisse";
    case Beer_Style_Enum.BiereDeGarde:
      return "Bière de Garde";
    case Beer_Style_Enum.Bitter:
      return "Bitter";
    case Beer_Style_Enum.BlondeAle:
      return "Blonde Ale";
    case Beer_Style_Enum.Bock:
      return "Bock";
    case Beer_Style_Enum.BrownAle:
      return "Brown Ale";
    case Beer_Style_Enum.CreamAle:
      return "Cream Ale";
    case Beer_Style_Enum.Doppelbock:
      return "Doppelbock";
    case Beer_Style_Enum.DortmunderExport:
      return "Dortmunder Export";
    case Beer_Style_Enum.Dunkel:
      return "Dunkel";
    case Beer_Style_Enum.Dunkelweizen:
      return "Dunkel Weizen";
    case Beer_Style_Enum.Eisbock:
      return "Eisbock";
    case Beer_Style_Enum.FlandersRedAle:
      return "Flanders Red Ale";
    case Beer_Style_Enum.FruitBeer:
      return "Fruit Beer";
    case Beer_Style_Enum.Geuze:
      return "Gueuze";
    case Beer_Style_Enum.GoldenSummerAle:
      return "Golden Summer Ale";
    case Beer_Style_Enum.Gose:
      return "Gose";
    case Beer_Style_Enum.Hefeweizen:
      return "Hefeweizen";
    case Beer_Style_Enum.HerbAndSpicedBeer:
      return "Herb/Spice Beer";
    case Beer_Style_Enum.HoneyBeer:
      return "Honey Beer";
    case Beer_Style_Enum.Helles:
      return "Helles";
    case Beer_Style_Enum.IndiaPaleAle:
      return "India Pale Ale";
    case Beer_Style_Enum.Kolsch:
      return "Kolsch";
    case Beer_Style_Enum.Lambic:
      return "Lambic";
    case Beer_Style_Enum.LightAle:
      return "Light Ale";
    case Beer_Style_Enum.MaibockHellesBock:
      return "Maibock";
    case Beer_Style_Enum.MaltLiquor:
      return "Malt Liquor";
    case Beer_Style_Enum.Mild:
      return "Mild";
    case Beer_Style_Enum.OktoberfestbierMarzendbier:
      return "Oktoberfest";
    case Beer_Style_Enum.OldAle:
      return "Old Ale";
    case Beer_Style_Enum.OudBruin:
      return "Oud bruin	";
    case Beer_Style_Enum.PaleAle:
      return "Pale Ale";
    case Beer_Style_Enum.PilsenerPilsnerPils:
      return "Pilsner";
    case Beer_Style_Enum.Porter:
      return "Porter";
    case Beer_Style_Enum.RedAle:
      return "Red Ale";
    case Beer_Style_Enum.Roggenbier:
      return "Roggenbier";
    case Beer_Style_Enum.RyeBeer:
      return "Rye Beer";
    case Beer_Style_Enum.Saison:
      return "Saison";
    case Beer_Style_Enum.Schwarzbier:
      return "Schwarzbier";
    case Beer_Style_Enum.ScotchAle:
      return "Scotch Ale";
    case Beer_Style_Enum.SmokedBeer:
      return "Smoked Beer";
    case Beer_Style_Enum.SteamBeer:
      return "Steam Beer";
    case Beer_Style_Enum.VegetableBeer:
      return "Vegetable Beer";
    case Beer_Style_Enum.ViennaLager:
      return "Vieena";
    case Beer_Style_Enum.Weissbier:
      return "Weissbier";
    case Beer_Style_Enum.Weizenbock:
      return "Weizenbock";
    case Beer_Style_Enum.WildBeer:
      return "Wild Beer";
    case Beer_Style_Enum.Witbier:
      return "Witbier";
    case Beer_Style_Enum.Stout:
      return "Stout";
    case Beer_Style_Enum.WoodAgedBeer:
      return "Wood-Aged Beer";
    default:
      return type;
  }
};
