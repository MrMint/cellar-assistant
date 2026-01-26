// Format utility functions for enum values

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
const isNil = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

export const formatEnum = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  return type
    .toLowerCase()
    .split("_")
    .map((x) => x[0].toUpperCase() + x.substring(1))
    .join(" ");
};

export const formatCountry = (type: string | null | undefined) => {
  return formatEnum(type);
};

export const formatSpiritType = (type: string | null | undefined) => {
  switch (type) {
    case "AMARO_APERITIF_VERMOUTH":
      return "Amaro, Aperitif & Vermouth";
    case "BRANDY_COGNAC":
      return "Brandy & Cognac";
    default:
      return formatEnum(type);
  }
};

export const formatWineVariety = (type: string | null | undefined) => {
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
export const formatWineStyle = (style: string | null | undefined) => {
  switch (style) {
    case "ROSE":
      return "Rosé";
    default:
      return formatEnum(style);
  }
};

export const formatBeerStyle = (type: string | null | undefined) => {
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

export const formatSakeCategory = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "junmai":
      return "Junmai";
    case "honjozo":
      return "Honjozo";
    case "ginjo":
      return "Ginjo";
    case "daiginjo":
      return "Daiginjo";
    case "junmai_ginjo":
      return "Junmai Ginjo";
    case "junmai_daiginjo":
      return "Junmai Daiginjo";
    case "tokubetsu_junmai":
      return "Tokubetsu Junmai";
    case "tokubetsu_honjozo":
      return "Tokubetsu Honjozo";
    case "futsushu":
      return "Futsushu";
    case "namazake":
      return "Namazake";
    case "nigorizake":
      return "Nigorizake";
    case "koshu":
      return "Koshu";
    case "genshu":
      return "Genshu";
    case "taruzake":
      return "Taruzake";
    default:
      return formatEnum(type);
  }
};

export const formatSakeType = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "dry":
      return "Dry (Karakuchi)";
    case "sweet":
      return "Sweet (Amakuchi)";
    case "medium_dry":
      return "Medium Dry";
    case "medium_sweet":
      return "Medium Sweet";
    case "light":
      return "Light (Tanrei)";
    case "rich":
      return "Rich (Nōjun)";
    case "fruity":
      return "Fruity";
    case "earthy":
      return "Earthy";
    case "floral":
      return "Floral";
    case "umami":
      return "Umami";
    default:
      return formatEnum(type);
  }
};

export const formatSakeServingTemperature = (
  type: string | null | undefined,
) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "tobikiri_kan":
      return "Tobikiri-kan (Very Hot)";
    case "atsu_kan":
      return "Atsu-kan (Hot)";
    case "jo_kan":
      return "Jo-kan (Warm)";
    case "nuru_kan":
      return "Nuru-kan (Body Temp)";
    case "hitohada_kan":
      return "Hitohada-kan (Skin Temp)";
    case "room_temperature":
      return "Room Temperature";
    case "hiya":
      return "Hiya (Cool)";
    case "rei_shu":
      return "Rei-shu (Chilled)";
    case "yuki_hie":
      return "Yuki-hie (Snow Cold)";
    default:
      return formatEnum(type);
  }
};

export const formatSakeRiceVariety = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "yamadanishiki":
      return "Yamadanishiki";
    case "gohyakumangoku":
      return "Gohyakumangoku";
    case "miyamanishiki":
      return "Miyamanishiki";
    case "omachi":
      return "Omachi";
    case "hattan_nishiki":
      return "Hattan Nishiki";
    case "dewasansan":
      return "Dewasansan";
    case "ginpu":
      return "Ginpu";
    case "akita_sake_komachi":
      return "Akita Sake Komachi";
    case "kamenoo":
      return "Kamenoo";
    case "aizan":
      return "Aizan";
    case "yumesansui":
      return "Yumesansui";
    case "wakamizu":
      return "Wakamizu";
    default:
      return formatEnum(type);
  }
};
