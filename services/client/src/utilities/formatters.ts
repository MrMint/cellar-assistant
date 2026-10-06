/**
 * Display formatters for reference-table and enum values, restored from
 * `82450ad1:functions/_packages/shared/utility/index.ts` (imported there as
 * `@cellar-assistant/shared/utility`).
 *
 * The old UI labelled every enum with these, so the restored components do
 * too: `PINOT_NOIR` → `Pinot Noir` (title case), with hand-written spellings
 * for the values title case gets wrong (`ROSE` → `Rosé`). The rewrite's
 * `humanizeReferenceValue` sentence-cases instead (`Pinot noir`); that is the
 * drift these exist to undo, so they are copied, not unified with it.
 *
 * Pure and dependency-free, so both server and client modules may import them.
 */

const isNil = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

export const formatEnum = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  return type
    .toLowerCase()
    .split("_")
    .map((x) => (x.length === 0 ? x : x[0].toUpperCase() + x.substring(1)))
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
      // The old label read "Vieena" — a typo, not a spelling decision.
      return "Vienna";
    case "WOOD_AGED_BEER":
      return "Wood-Aged Beer";
    default:
      return formatEnum(type);
  }
};

export const formatSakeCategory = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "junmai_ginjo":
      return "Junmai Ginjo";
    case "junmai_daiginjo":
      return "Junmai Daiginjo";
    case "tokubetsu_junmai":
      return "Tokubetsu Junmai";
    case "tokubetsu_honjozo":
      return "Tokubetsu Honjozo";
    default:
      // junmai, honjozo, ginjo, daiginjo, futsushu, namazake, nigorizake,
      // koshu, genshu, taruzake: the old table spelled each as title case.
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
    case "light":
      return "Light (Tanrei)";
    case "rich":
      return "Rich (Nōjun)";
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
    case "hattan_nishiki":
      return "Hattan Nishiki";
    case "akita_sake_komachi":
      return "Akita Sake Komachi";
    default:
      return formatEnum(type);
  }
};

export const formatTeaCategory = (type: string | null | undefined) => {
  if (isNil(type)) return undefined;
  switch (type) {
    case "pu_erh":
      return "Pu-erh";
    case "mate":
      return "Maté";
    default:
      return formatEnum(type);
  }
};

export const formatTeaForm = (type: string | null | undefined) =>
  isNil(type) ? undefined : formatEnum(type);

export const formatTeaCaffeineLevel = (type: string | null | undefined) =>
  isNil(type) ? undefined : formatEnum(type);
