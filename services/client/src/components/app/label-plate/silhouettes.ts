/**
 * B03's vessel table: which silhouette a LabelPlate draws, from the item's
 * style fields, falling back to the type's own vessel (N28's six).
 *
 * Every path sits on the 64 × 160 grid `VesselSilhouette` draws in (the Pour
 * sheet clips its liquid to the same box, X03). The eight style vessels are
 * the Main board's (`boards/project/Main.dc.html`), scaled from its 40 × 100
 * box by 1.6 — the same aspect, so nothing is stretched.
 *
 * The list is design-direction §3.5's, kept only where a style field we store
 * can drive it (L19): Port (no fortified style exists, and DESSERT is also
 * Sauternes) and Isshobin (a bottle size, which no field records) are left
 * out. Deterministic and pure: the same fields always give the same vessel.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";

export const VESSEL_NAMES = [
  "bordeaux",
  "burgundy",
  "sparkling",
  "alsace",
  "tall-neck",
  "stubby",
  "can",
  "decanter",
  "square",
  "tall",
  "tokkuri",
  "bag",
  "tin",
  "pouch",
] as const;

export type VesselName = (typeof VESSEL_NAMES)[number];

export type VesselPath = { readonly d: string; readonly evenOdd?: boolean };

export const VESSEL_PATHS: Readonly<Record<VesselName, VesselPath>> = {
  // A Bordeaux bottle: straight neck, high shoulders.
  bordeaux: {
    d: "M27 4H37V8H36V48C36 56 50 58 50 72V152Q50 156 46 156H18Q14 156 14 152V72C14 58 28 56 28 48V8H27Z",
  },
  // A Burgundy bottle: the long, sloping shoulder.
  burgundy: {
    d: "M25.6 6.4h12.8v28.8c0 16 16 22.4 16 41.6v70.4a6.4 6.4 0 0 1 -6.4 6.4H16a6.4 6.4 0 0 1 -6.4 -6.4V76.8c0 -19.2 16 -25.6 16 -41.6z",
  },
  // A sparkling bottle: wide, heavy, a broad neck for the cork.
  sparkling: {
    d: "M24 6.4h16v32c0 16 17.6 20.8 17.6 41.6v67.2a6.4 6.4 0 0 1 -6.4 6.4H12.8a6.4 6.4 0 0 1 -6.4 -6.4V80c0 -20.8 17.6 -25.6 17.6 -41.6z",
  },
  // An Alsace flute: tall and slender.
  alsace: {
    d: "M27.2 3.2h9.6v41.6c0 12.8 9.6 16 9.6 28.8v76.8a4.8 4.8 0 0 1 -4.8 4.8H22.4a4.8 4.8 0 0 1 -4.8 -4.8V73.6c0 -12.8 9.6 -16 9.6 -28.8z",
  },
  // A tall-neck beer bottle: long neck, long sloping shoulder.
  "tall-neck": {
    d: "M28 4H36V9H35V40C35 52 47 60 47 78V152Q47 156 43 156H21Q17 156 17 152V78C17 60 29 52 29 40V9H28Z",
  },
  // A stubby: the short neck of a lager or a pils.
  stubby: {
    d: "M27.2 32h9.6v19.2c0 6.4 12.8 9.6 12.8 19.2v76.8a6.4 6.4 0 0 1 -6.4 6.4H20.8a6.4 6.4 0 0 1 -6.4 -6.4V70.4c0 -9.6 12.8 -12.8 12.8 -19.2z",
  },
  // A can, for the styles that ship in one.
  can: { d: "M16 28.8h32l3.2 6.4v112l-3.2 6.4H16l-3.2 -6.4V35.2z" },
  // A decanter with its stopper — not a cocktail glass (visual-7).
  decanter: {
    d: "M25 4H39Q41 4 41 6V14Q41 16 39 16H25Q23 16 23 14V6Q23 4 25 4ZM28 18H36V26C36 30 56 32 56 42V148Q56 156 48 156H16Q8 156 8 148V42C8 32 28 30 28 26Z",
  },
  // A square whiskey bottle.
  square: {
    d: "M25.6 12.8h12.8v19.2h12.8a3.2 3.2 0 0 1 3.2 3.2v112a3.2 3.2 0 0 1 -3.2 3.2H12.8a3.2 3.2 0 0 1 -3.2 -3.2V35.2a3.2 3.2 0 0 1 3.2 -3.2h12.8z",
  },
  // A tall clear-spirit bottle: gin, vodka.
  tall: {
    d: "M27.2 6.4h9.6v41.6c0 4.8 8 6.4 8 12.8v86.4a4.8 4.8 0 0 1 -4.8 4.8H24a4.8 4.8 0 0 1 -4.8 -4.8V60.8c0 -6.4 8 -8 8 -12.8z",
  },
  // A tokkuri: flared lip, narrow neck, a full belly — not a tumbler.
  tokkuri: {
    d: "M22 4H42Q42 8 37 12V30C37 44 56 62 56 104C56 140 46 156 32 156C18 156 8 140 8 104C8 62 27 44 27 30V12Q22 8 22 4Z",
  },
  // A coffee bag: the crimped seal, then the bag with its one-way valve.
  bag: {
    d: "M12 6H52V18H12ZM10 22H54L52 150Q52 156 46 156H18Q12 156 12 150ZM26 58A6 6 0 1 0 38 58A6 6 0 1 0 26 58Z",
    evenOdd: true,
  },
  // A tea tin: knob, lid, can.
  tin: {
    d: "M27 6H37V14H27ZM12 14H52Q54 14 54 16V30H10V16Q10 14 12 14ZM13 33H51V150Q51 156 45 156H19Q13 156 13 150Z",
  },
  // A pouch: matcha, bags, sachets.
  pouch: {
    d: "M16 16h32l3.2 9.6 -3.2 6.4 6.4 118.4H9.6l6.4 -118.4 -3.2 -6.4z",
  },
};

/** The fallback: one vessel per type, the plate N28 drew for every item. */
export const TYPE_VESSEL: Readonly<Record<ApiItemType, VesselName>> = {
  WINE: "bordeaux",
  BEER: "tall-neck",
  SPIRIT: "decanter",
  SAKE: "tokkuri",
  COFFEE: "bag",
  TEA: "tin",
};

/**
 * The style fields a plate reads — the `StyleFields` shape `drink-soon.ts`
 * derives (L37: WINE `style`, BEER `style`, SPIRIT `spiritType`, TEA
 * `category`, as `style`; TEA `form`), plus WINE `variety`. Any may be
 * absent; an absent field matches no row.
 */
export type PlateStyleFields = {
  readonly style?: string | null;
  readonly variety?: string | null;
  readonly form?: string | null;
};

export type VesselRule = {
  readonly type: ApiItemType;
  readonly field: keyof PlateStyleFields;
  /** Whole words of the stored value: `PINOT_NOIR` matches "pinot noir". */
  readonly phrases: readonly string[];
  readonly vessel: VesselName;
};

/** First match wins, so a sparkling chardonnay is sparkling, not Burgundy. */
export const VESSEL_RULES: readonly VesselRule[] = [
  { type: "WINE", field: "style", phrases: ["sparkling"], vessel: "sparkling" },
  {
    type: "WINE",
    field: "variety",
    phrases: ["pinot noir", "chardonnay"],
    vessel: "burgundy",
  },
  {
    type: "WINE",
    field: "variety",
    phrases: ["riesling", "gewurztraminer"],
    vessel: "alsace",
  },
  {
    type: "BEER",
    field: "style",
    phrases: ["ipa", "india pale ale", "sour", "gose"],
    vessel: "can",
  },
  {
    type: "BEER",
    field: "style",
    phrases: ["lager", "pils", "pilsner", "pilsener", "helles"],
    vessel: "stubby",
  },
  {
    type: "SPIRIT",
    field: "style",
    phrases: ["whiskey", "whisky", "scotch", "bourbon", "rye"],
    vessel: "square",
  },
  {
    type: "SPIRIT",
    field: "style",
    phrases: ["gin", "vodka"],
    vessel: "tall",
  },
  {
    type: "TEA",
    field: "form",
    phrases: ["tea bag", "sachet", "matcha powder", "instant"],
    vessel: "pouch",
  },
];

/** `"GEWÜRZTRAMINER"`, `"Pilsener_Pilsner_Pils"` → space-padded lower words. */
const words = (value: string): string =>
  ` ${value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const matches = (value: string | null | undefined, phrase: string) =>
  value !== null && value !== undefined && words(value).includes(` ${phrase} `);

/** The vessel for this item: its style's, else its type's. */
export const vesselFor = (
  type: ApiItemType,
  fields?: PlateStyleFields | null,
): VesselName => {
  if (fields !== undefined && fields !== null) {
    for (const rule of VESSEL_RULES) {
      if (rule.type !== type) continue;
      const value = fields[rule.field];
      if (rule.phrases.some((phrase) => matches(value, phrase))) {
        return rule.vessel;
      }
    }
  }
  return TYPE_VESSEL[type];
};
