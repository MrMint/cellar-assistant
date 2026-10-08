/**
 * The retrieval eval's labelled menus (roadmap N05): ten menus as OCR text,
 * each line labelled with what the extractor makes of it and which catalog
 * entry it is — or `null` when it is deliberately not in the catalog.
 *
 * ## What a line carries, and why
 *
 * `MenuMatchJobActor` does not read OCR. It reads `place_menu_items` rows the
 * extractor (`menu-ai.ts`, a vision model) wrote: `menu_item_name`,
 * `menu_item_description`, `detected_item_type` and `search_name` — the
 * model's normalised name. This eval measures **matching**, so each line
 * carries those four fields as a reasonable extractor would fill them, and
 * the raw `ocr` line beside them for the day extraction gets its own eval
 * (N06a) and needs the input too. `menuOcrText` reassembles the menu.
 *
 * `searchName` is `null` on some lines on purpose — the extractor does leave
 * it blank, and then the job searches with the menu's own wording
 * (`searchTextOf`), abbreviations and prices' neighbours included.
 *
 * ## The `null` lines
 *
 * About one line in five is a real product that is **not** in the fixture
 * catalog ("Talisker 10", "Bud Light") or not a product at all ("House Red").
 * Retrieval will still find *something* near it; whether the job then
 * suggests it is what `falseAutoMatches` and `correctRejections` count.
 */
import type { ScannedItemType } from "@cellar-assistant/contracts";

export type MenuLine = {
  readonly id: string;
  /** The line as OCR read it, price and all. */
  readonly ocr: string;
  readonly name: string;
  readonly description?: string;
  readonly detectedType: ScannedItemType;
  readonly searchName: string | null;
  readonly expected: string | null;
};

export type EvalMenu = {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly MenuLine[];
};

export const MENUS: readonly EvalMenu[] = [
  {
    id: "whisky-bar",
    title: "SINGLE MALTS — 2oz pour",
    lines: [
      {
        id: "whisky-bar/lagavulin",
        ocr: "Lagavulin 16yr ..... Islay ..... 24",
        name: "Lagavulin 16yr",
        description: "Islay",
        detectedType: "spirit",
        searchName: "Lagavulin 16 Year Old",
        expected: "spirit.lagavulin-16",
      },
      {
        id: "whisky-bar/laphroaig",
        ocr: "Laphroaig 10 .......... 16",
        name: "Laphroaig 10",
        detectedType: "spirit",
        searchName: "Laphroaig 10",
        expected: "spirit.laphroaig-10",
      },
      {
        id: "whisky-bar/glenlivet",
        ocr: "Glenlivet 12 Speyside .. 14",
        name: "Glenlivet 12 Speyside",
        detectedType: "spirit",
        searchName: "Glenlivet 12",
        expected: "spirit.glenlivet-12",
      },
      {
        id: "whisky-bar/macallan",
        ocr: "Macallan 12 Sherry Cask .. 22",
        name: "Macallan 12 Sherry Cask",
        detectedType: "spirit",
        searchName: "Macallan 12 Sherry Cask",
        expected: "spirit.macallan-12-sherry-oak",
      },
      {
        id: "whisky-bar/talisker",
        ocr: "Talisker 10 — Isle of Skye .. 17",
        name: "Talisker 10",
        description: "Isle of Skye",
        detectedType: "spirit",
        searchName: "Talisker 10 Year Old",
        expected: null,
      },
      {
        id: "whisky-bar/jameson",
        ocr: "Jameson ................. 10",
        name: "Jameson",
        detectedType: "spirit",
        searchName: null,
        expected: "spirit.jameson",
      },
    ],
  },
  {
    id: "bourbon-flight",
    title: "AMERICAN WHISKEY",
    lines: [
      {
        id: "bourbon-flight/buffalo-trace",
        ocr: "Buffalo Trace  12",
        name: "Buffalo Trace",
        detectedType: "spirit",
        searchName: "Buffalo Trace Bourbon",
        expected: "spirit.buffalo-trace",
      },
      {
        id: "bourbon-flight/eagle-rare",
        ocr: "Eagle Rare 10yr  15",
        name: "Eagle Rare 10yr",
        detectedType: "spirit",
        searchName: "Eagle Rare 10 Year",
        expected: "spirit.eagle-rare-10",
      },
      {
        id: "bourbon-flight/blantons",
        ocr: "Blanton's Single Barrel  20",
        name: "Blanton's Single Barrel",
        detectedType: "spirit",
        searchName: "Blanton's Single Barrel Bourbon",
        expected: "spirit.blantons-original",
      },
      {
        id: "bourbon-flight/makers",
        ocr: "Makers Mark  11",
        name: "Makers Mark",
        detectedType: "spirit",
        searchName: null,
        expected: "spirit.makers-mark",
      },
      {
        id: "bourbon-flight/woodford",
        ocr: "Woodford Reserve  13",
        name: "Woodford Reserve",
        detectedType: "spirit",
        searchName: "Woodford Reserve Bourbon",
        expected: "spirit.woodford-reserve",
      },
      {
        id: "bourbon-flight/pappy",
        ocr: "Pappy Van Winkle 15yr  MP",
        name: "Pappy Van Winkle 15yr",
        detectedType: "spirit",
        searchName: "Pappy Van Winkle 15 Year",
        expected: null,
      },
    ],
  },
  {
    id: "wine-by-the-glass",
    title: "WINE BY THE GLASS",
    lines: [
      {
        id: "wbtg/cloudy-bay",
        ocr: "Cloudy Bay Sauv Blanc, Marlborough NZ '23  18",
        name: "Cloudy Bay Sauv Blanc",
        description: "Marlborough NZ '23",
        detectedType: "wine",
        searchName: "Cloudy Bay Sauvignon Blanc 2023",
        expected: "wine.cloudy-bay-sauvignon-blanc",
      },
      {
        id: "wbtg/meiomi",
        ocr: "Meiomi Pinot Noir, California  14",
        name: "Meiomi Pinot Noir",
        description: "California",
        detectedType: "wine",
        searchName: "Meiomi Pinot Noir",
        expected: "wine.meiomi-pinot-noir",
      },
      {
        id: "wbtg/santa-margherita",
        ocr: "Santa Margherita Pinot Grigio  15",
        name: "Santa Margherita Pinot Grigio",
        detectedType: "wine",
        searchName: null,
        expected: "wine.santa-margherita-pinot-grigio",
      },
      {
        id: "wbtg/whispering-angel",
        ocr: "Whispering Angel Rosé, Provence  16",
        name: "Whispering Angel Rosé",
        description: "Provence",
        detectedType: "wine",
        searchName: "Whispering Angel Rosé",
        expected: "wine.whispering-angel",
      },
      {
        id: "wbtg/la-marca",
        ocr: "La Marca Prosecco NV  12",
        name: "La Marca Prosecco NV",
        detectedType: "wine",
        searchName: "La Marca Prosecco",
        expected: "wine.la-marca-prosecco",
      },
      {
        id: "wbtg/house-cab",
        ocr: "House Cabernet  10",
        name: "House Cabernet",
        detectedType: "wine",
        searchName: "House Cabernet Sauvignon",
        expected: null,
      },
    ],
  },
  {
    id: "wine-by-the-bottle",
    title: "RESERVE LIST",
    lines: [
      {
        id: "wbtb/caymus",
        ocr: "Caymus Cab Sauv, Napa 2021 ....... 145",
        name: "Caymus Cab Sauv",
        description: "Napa 2021",
        detectedType: "wine",
        searchName: "Caymus Cabernet Sauvignon 2021",
        expected: "wine.caymus-cabernet-2021",
      },
      {
        id: "wbtb/margaux",
        ocr: "Ch. Margaux 1er GCC 2015 ...... 1200",
        name: "Ch. Margaux 1er GCC 2015",
        detectedType: "wine",
        searchName: null,
        expected: "wine.chateau-margaux-2015",
      },
      {
        id: "wbtb/tignanello",
        ocr: "Tignanello, Antinori 2020 ...... 180",
        name: "Tignanello",
        description: "Antinori 2020",
        detectedType: "wine",
        searchName: "Antinori Tignanello 2020",
        expected: "wine.tignanello",
      },
      {
        id: "wbtb/catena",
        ocr: "Catena Malbec, Mendoza ......... 55",
        name: "Catena Malbec",
        description: "Mendoza",
        detectedType: "wine",
        searchName: "Catena Malbec",
        expected: "wine.catena-malbec",
      },
      {
        id: "wbtb/rombauer",
        ocr: "Rombauer Chard, Carneros ....... 70",
        name: "Rombauer Chard",
        description: "Carneros",
        detectedType: "wine",
        searchName: null,
        expected: "wine.rombauer-chardonnay",
      },
      {
        id: "wbtb/opus-one",
        ocr: "Opus One 2019 .................. 450",
        name: "Opus One 2019",
        detectedType: "wine",
        searchName: "Opus One 2019",
        expected: null,
      },
    ],
  },
  {
    id: "taproom",
    title: "ON TAP",
    lines: [
      {
        id: "taproom/pliny",
        ocr: "Pliny the Elder — Russian River DIPA 8%  9",
        name: "Pliny the Elder",
        description: "Russian River DIPA 8%",
        detectedType: "beer",
        searchName: "Pliny the Elder",
        expected: "beer.pliny-the-elder",
      },
      {
        id: "taproom/heady",
        ocr: "Heady Topper (16oz can)  8",
        name: "Heady Topper (16oz can)",
        detectedType: "beer",
        searchName: null,
        expected: "beer.heady-topper",
      },
      {
        id: "taproom/sierra",
        ocr: "Sierra Nevada Pale  7",
        name: "Sierra Nevada Pale",
        detectedType: "beer",
        searchName: "Sierra Nevada Pale Ale",
        expected: "beer.sierra-nevada-pale-ale",
      },
      {
        id: "taproom/guinness",
        ocr: "Guinness on Nitro  8",
        name: "Guinness on Nitro",
        detectedType: "beer",
        searchName: "Guinness Draught",
        expected: "beer.guinness-draught",
      },
      {
        id: "taproom/allagash",
        ocr: "Allagash White  7",
        name: "Allagash White",
        detectedType: "beer",
        searchName: "Allagash White",
        expected: "beer.allagash-white",
      },
      {
        id: "taproom/bud-light",
        ocr: "Bud Light  5",
        name: "Bud Light",
        detectedType: "beer",
        searchName: "Bud Light",
        expected: null,
      },
      {
        id: "taproom/local-hazy",
        ocr: "Local Hazy IPA (rotating)  8",
        name: "Local Hazy IPA",
        description: "rotating",
        detectedType: "beer",
        searchName: null,
        expected: null,
      },
    ],
  },
  {
    id: "belgian-bar",
    title: "BELGIAN & GERMAN BOTTLES",
    lines: [
      {
        id: "belgian/duvel",
        ocr: "Duvel 33cl  9",
        name: "Duvel",
        detectedType: "beer",
        searchName: "Duvel",
        expected: "beer.duvel",
      },
      {
        id: "belgian/cantillon",
        ocr: "Cantillon Gueuze 375ml  28",
        name: "Cantillon Gueuze",
        detectedType: "beer",
        searchName: "Cantillon Gueuze",
        expected: "beer.cantillon-gueuze",
      },
      {
        id: "belgian/westmalle",
        ocr: "Westmalle Tripel  11",
        name: "Westmalle Tripel",
        detectedType: "beer",
        searchName: "Westmalle Tripel",
        expected: null,
      },
      {
        id: "belgian/weihenstephaner",
        ocr: "Weihenstephaner Hefe 0.5L  8",
        name: "Weihenstephaner Hefe",
        detectedType: "beer",
        searchName: null,
        expected: "beer.weihenstephaner-hefeweissbier",
      },
      {
        id: "belgian/urquell",
        ocr: "Pilsner Urquell  7",
        name: "Pilsner Urquell",
        detectedType: "beer",
        searchName: "Pilsner Urquell",
        expected: "beer.pilsner-urquell",
      },
    ],
  },
  {
    id: "agave-and-gin",
    title: "AGAVE · GIN · OTHER",
    lines: [
      {
        id: "agave/don-julio",
        ocr: "Don Julio Blanco  13",
        name: "Don Julio Blanco",
        detectedType: "spirit",
        searchName: "Don Julio Blanco Tequila",
        expected: "spirit.don-julio-blanco",
      },
      {
        id: "agave/clase-azul",
        ocr: "Clase Azul Repo  30",
        name: "Clase Azul Repo",
        detectedType: "spirit",
        searchName: null,
        expected: "spirit.clase-azul-reposado",
      },
      {
        id: "agave/vida",
        ocr: "Del Maguey 'Vida' Mezcal  12",
        name: "Del Maguey 'Vida' Mezcal",
        detectedType: "spirit",
        searchName: "Del Maguey Vida Mezcal",
        expected: "spirit.del-maguey-vida",
      },
      {
        id: "agave/casamigos",
        ocr: "Casamigos Añejo  16",
        name: "Casamigos Añejo",
        detectedType: "spirit",
        searchName: "Casamigos Añejo Tequila",
        expected: null,
      },
      {
        id: "agave/hendricks",
        ocr: "Hendricks  12",
        name: "Hendricks",
        detectedType: "spirit",
        searchName: null,
        expected: "spirit.hendricks",
      },
      {
        id: "agave/tanqueray",
        ocr: "Tanqueray  10",
        name: "Tanqueray",
        detectedType: "spirit",
        searchName: "Tanqueray London Dry Gin",
        expected: "spirit.tanqueray",
      },
      {
        id: "agave/hennessy",
        ocr: "Hennessy VSOP  15",
        name: "Hennessy VSOP",
        detectedType: "unknown",
        searchName: "Hennessy VSOP",
        expected: "spirit.hennessy-vsop",
      },
    ],
  },
  {
    id: "sake-list",
    title: "SAKE (180ml / 720ml)",
    lines: [
      {
        id: "sake/dassai-45",
        ocr: "Dassai 45 Junmai Daiginjo  22 / 80",
        name: "Dassai 45 Junmai Daiginjo",
        detectedType: "sake",
        searchName: "Dassai 45",
        expected: "sake.dassai-45",
      },
      {
        id: "sake/dassai-23",
        ocr: "Dassai 23  45 / 160",
        name: "Dassai 23",
        detectedType: "sake",
        searchName: null,
        expected: "sake.dassai-23",
      },
      {
        id: "sake/kubota",
        ocr: "Kubota Manju  38 / 140",
        name: "Kubota Manju",
        detectedType: "sake",
        searchName: "Kubota Manju",
        expected: "sake.kubota-manju",
      },
      {
        id: "sake/hakkaisan",
        ocr: "Hakkaisan Tokubetsu Honjozo (warm ok)  16 / 60",
        name: "Hakkaisan Tokubetsu Honjozo",
        description: "warm ok",
        detectedType: "sake",
        searchName: "Hakkaisan Tokubetsu Honjozo",
        expected: "sake.hakkaisan-tokubetsu-honjozo",
      },
      {
        id: "sake/nigori",
        ocr: "Gekkeikan Nigori (unfiltered)  12 / 40",
        name: "Gekkeikan Nigori",
        description: "unfiltered",
        detectedType: "sake",
        searchName: "Gekkeikan Nigori",
        expected: "sake.gekkeikan-nigori",
      },
      {
        id: "sake/house-hot",
        ocr: "House Hot Sake  8",
        name: "House Hot Sake",
        detectedType: "sake",
        searchName: null,
        expected: null,
      },
    ],
  },
  {
    id: "coffee-bar",
    title: "SINGLE ORIGIN POUR OVER",
    lines: [
      {
        id: "coffee/yirgacheffe",
        ocr: "Ethiopia Yirgacheffe — jasmine, lemon  6",
        name: "Ethiopia Yirgacheffe",
        description: "jasmine, lemon",
        detectedType: "coffee",
        searchName: "Ethiopia Yirgacheffe",
        expected: "coffee.ethiopia-yirgacheffe",
      },
      {
        id: "coffee/huila",
        ocr: "Colombia Huila — caramel, apple  5",
        name: "Colombia Huila",
        description: "caramel, apple",
        detectedType: "coffee",
        searchName: null,
        expected: "coffee.colombia-huila",
      },
      {
        id: "coffee/kenya",
        ocr: "Kenya AA — blackcurrant  6",
        name: "Kenya AA",
        description: "blackcurrant",
        detectedType: "coffee",
        searchName: "Kenya AA",
        expected: "coffee.kenya-aa-nyeri",
      },
      {
        id: "coffee/sumatra",
        ocr: "Sumatra Mandheling (dark)  5",
        name: "Sumatra Mandheling",
        description: "dark",
        detectedType: "coffee",
        searchName: "Sumatra Mandheling",
        expected: "coffee.sumatra-mandheling",
      },
      {
        id: "coffee/geisha",
        ocr: "Panama Geisha, La Esmeralda  14",
        name: "Panama Geisha",
        description: "La Esmeralda",
        detectedType: "coffee",
        searchName: "Esmeralda Geisha",
        expected: "coffee.esmeralda-geisha",
      },
      {
        id: "coffee/house-espresso",
        ocr: "House Espresso Blend  4",
        name: "House Espresso Blend",
        detectedType: "coffee",
        searchName: null,
        expected: null,
      },
    ],
  },
  {
    id: "tea-house",
    title: "TEA — pot for one",
    lines: [
      {
        id: "tea/tgy",
        ocr: "Tie Guan Yin (Iron Goddess)  7",
        name: "Tie Guan Yin",
        description: "Iron Goddess",
        detectedType: "tea",
        searchName: "Tie Guan Yin Oolong",
        expected: "tea.tie-guan-yin",
      },
      {
        id: "tea/longjing",
        ocr: "Dragon Well / Longjing  7",
        name: "Dragon Well / Longjing",
        detectedType: "tea",
        searchName: null,
        expected: "tea.longjing",
      },
      {
        id: "tea/darjeeling",
        ocr: "Darjeeling 1st Flush  6",
        name: "Darjeeling 1st Flush",
        detectedType: "tea",
        searchName: "Darjeeling First Flush",
        expected: "tea.darjeeling-first-flush",
      },
      {
        id: "tea/earl-grey",
        ocr: "Earl Grey  5",
        name: "Earl Grey",
        detectedType: "tea",
        searchName: "Earl Grey",
        expected: "tea.twinings-earl-grey",
      },
      {
        id: "tea/matcha",
        ocr: "Ceremonial Matcha (Ippodo)  9",
        name: "Ceremonial Matcha",
        description: "Ippodo",
        detectedType: "tea",
        searchName: "Ippodo Matcha",
        expected: "tea.ippodo-matcha",
      },
      {
        id: "tea/chamomile",
        ocr: "Chamomile  5",
        name: "Chamomile",
        detectedType: "tea",
        searchName: "Chamomile Herbal Tea",
        expected: null,
      },
    ],
  },
];

/** The menu as the OCR pass would have read it: title, then each line. */
export const menuOcrText = (menu: EvalMenu): string =>
  [menu.title, ...menu.lines.map((line) => line.ocr)].join("\n");
