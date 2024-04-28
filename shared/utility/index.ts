import {
  BeerStyle,
  Country,
  SpiritType,
  WineStyle,
  WineVariety,
} from "@shared/gql/graphql";

export const getIsCellarOwner = (
  userId: string,
  cellar?: { created_by_id: string; co_owners: { user_id: string }[] },
) => {
  if (isNil(cellar)) return false;
  return (
    cellar.created_by_id === userId ||
    cellar.co_owners.map((x) => x.user_id).includes(userId)
  );
};

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

export const formatCountry = (type: Country | null | undefined) => {
  return formatEnum(type);
};

export const formatSpiritType = (type: SpiritType) => {
  switch (type) {
    case "AMARO_APERITIF_VERMOUTH":
      return "Amaro, Aperitif & Vermouth";
    case "BRANDY_COGNAC":
      return "Brandy & Cognac";
    default:
      return formatEnum(type);
  }
};

export const formatWineVariety = (type: WineVariety | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "ALBARINO_ALVARINHO":
      return "Albariño / Alvarinho";
    case "CREMANT":
      return "Crémant";
    case "GEWURZTRAMINER":
      return "Gewürztraminer";
    case "GRUNER_VELTLINER":
      return "Grüner Veltliner";
    case "MOURVEDRE_MONASTRELL":
      return "Mourvedre/Monastrell";
    case "MULLER_THURGAU":
      return "Müller-Thurgau";
    case "PINOT_GRIGIO_PINOT_GRIS":
      return "Pinot Grigio";
    case "RHONE_BLENDS":
      return "Rhône Blend";
    case "SYRAH_SHIRAZ":
      return "Syrah/Shiraz";
    default:
      return formatEnum(type);
  }
};
export const formatWineStyle = (style: WineStyle) => {
  switch (style) {
    case "ROSE":
      return "Rosé";
    default:
      return formatEnum(style);
  }
};

export const formatBeerStyle = (type: BeerStyle | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "BIERE_DE_GARDE":
      return "Bière de Garde";
    case "HERB_AND_SPICED_BEER":
      return "Herb/Spice Beer";
    case "OKTOBERFESTBIER_MARZENDBIER":
      return "Oktoberfest";
    case "PILSENER_PILSNER_PILS":
      return "Pilsner";
    case "VIENNA_LAGER":
      return "Vieena";
    case "WOOD_AGED_BEER":
      return "Wood-Aged Beer";
    default:
      return formatEnum(type);
  }
};
