/**
 * ux-c L08 — Steep (tea) and Brew (coffee): the typical numbers.
 *
 * A fixed, hand-written table, labelled "typical" wherever it shows (ruling
 * L3: no model-estimated number anywhere). Tea by category, one western cup;
 * matcha by its form, since it is whisked, not steeped. Coffee by roast, one
 * pour-over cup. A style with no row here has no guide — the page shows
 * nothing until the user enters their own numbers (`BrewGuideSection`).
 * Pure: `brew-table.test.ts`.
 */
export type BrewNumbers = {
  readonly waterTempC: number | null;
  readonly steepSeconds: number | null;
  readonly doseGrams: number | null;
  readonly waterMl: number | null;
};

export type BrewRow = BrewNumbers & {
  /** "rolled oolong", "medium roast": what "typical for …" names. */
  readonly label: string;
  /**
   * W-23, board BrewGuide ("3–4 more steeps, add 15 s each"): how many more
   * steeps the leaves give, and how much longer each one runs. Only teas that
   * are usually re-steeped have one; black, herbal and the rest do not.
   */
  readonly resteeps?: Resteeps;
};

export type Resteeps = {
  readonly min: number;
  readonly max: number;
  readonly addSeconds: number;
};

export type BrewStyle = {
  /** TEA `category` (`green`, `pu_erh`, …). */
  readonly category?: string | null;
  /** TEA `form` (`loose_leaf`, `matcha_powder`, …). */
  readonly form?: string | null;
  /** COFFEE `roastLevel` (`LIGHT` … `EXTRA_DARK`). */
  readonly roastLevel?: string | null;
};

const tea = (
  label: string,
  waterTempC: number,
  steepSeconds: number,
  doseGrams: number,
  resteeps?: Resteeps,
): BrewRow => ({
  label,
  waterTempC,
  steepSeconds,
  doseGrams,
  waterMl: 250,
  ...(resteeps === undefined ? {} : { resteeps }),
});

const more = (min: number, max: number, addSeconds: number): Resteeps => ({
  min,
  max,
  addSeconds,
});

/** One cup, western style. `blend` and unknown categories have no row. */
const TEA_BY_CATEGORY: Readonly<Record<string, BrewRow>> = {
  green: tea("green tea", 80, 120, 2.5, more(1, 2, 30)),
  white: tea("white tea", 85, 240, 3, more(1, 2, 60)),
  yellow: tea("yellow tea", 80, 180, 3, more(1, 2, 30)),
  oolong: tea("oolong", 90, 180, 3, more(3, 4, 15)),
  black: tea("black tea", 95, 240, 2.5),
  dark: tea("dark tea", 95, 240, 3, more(2, 3, 30)),
  pu_erh: tea("pu-erh", 95, 240, 3, more(2, 3, 30)),
  herbal: tea("herbal tea", 100, 300, 2),
  rooibos: tea("rooibos", 100, 300, 2.5),
  mate: tea("mate", 75, 300, 3),
  chai: tea("chai", 100, 300, 3),
};

/** Whisked, not steeped: no steep time. */
const MATCHA: BrewRow = {
  label: "matcha",
  waterTempC: 75,
  steepSeconds: null,
  doseGrams: 2,
  waterMl: 70,
};

const coffee = (label: string, waterTempC: number): BrewRow => ({
  label,
  waterTempC,
  steepSeconds: 180,
  doseGrams: 15,
  waterMl: 250,
});

/** One pour-over cup, 15 g : 250 ml; darker roasts want cooler water. */
const COFFEE_BY_ROAST: Readonly<Record<string, BrewRow>> = {
  LIGHT: coffee("light roast", 96),
  LIGHT_MEDIUM: coffee("light-medium roast", 94),
  MEDIUM: coffee("medium roast", 93),
  MEDIUM_DARK: coffee("medium-dark roast", 91),
  DARK: coffee("dark roast", 88),
  EXTRA_DARK: coffee("extra-dark roast", 86),
};

const key = (value: string | null | undefined): string =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_");

/** The typical row for this tea or coffee, or `null` when there is none. */
export const typicalBrew = (type: string, style: BrewStyle): BrewRow | null => {
  if (type === "TEA") {
    if (key(style.form) === "matcha_powder") return MATCHA;
    return TEA_BY_CATEGORY[key(style.category)] ?? null;
  }
  if (type === "COFFEE") {
    return COFFEE_BY_ROAST[key(style.roastLevel).toUpperCase()] ?? null;
  }
  return null;
};

export type BrewFactKey = keyof BrewNumbers;
export type BrewFact = {
  readonly key: BrewFactKey;
  readonly value: number;
  readonly source: "yours" | "typical";
};

export type BrewGuide = {
  /** The typical row's label, or `null` when the guide is all yours. */
  readonly typicalFor: string | null;
  /** "3–4 more steeps, add 15 s each.", when the typical row has one. */
  readonly resteepLine: string | null;
  readonly facts: readonly BrewFact[];
  /** The timer's length: your steep, else the typical one, else none. */
  readonly steepSeconds: number | null;
};

const FACT_ORDER: readonly BrewFactKey[] = [
  "waterTempC",
  "steepSeconds",
  "doseGrams",
  "waterMl",
];

/**
 * Your numbers over the typical row, each marked with where it came from.
 * No row and no numbers of your own: `null`, and no guide is shown.
 */
export const brewGuide = (
  row: BrewRow | null,
  prefs: BrewNumbers | null,
): BrewGuide | null => {
  const facts: BrewFact[] = [];
  for (const k of FACT_ORDER) {
    const mine = prefs?.[k] ?? null;
    const typical = row?.[k] ?? null;
    if (mine !== null) facts.push({ key: k, value: mine, source: "yours" });
    else if (typical !== null)
      facts.push({ key: k, value: typical, source: "typical" });
  }
  if (facts.length === 0) return null;
  return {
    typicalFor: row?.label ?? null,
    resteepLine: resteepLine(row?.resteeps),
    facts,
    steepSeconds:
      facts.find((fact) => fact.key === "steepSeconds")?.value ?? null,
  };
};

/** The board's re-steep line: "3–4 more steeps, add 15 s each." */
export const resteepLine = (resteeps: Resteeps | undefined): string | null => {
  if (resteeps === undefined) return null;
  const { min, max, addSeconds } = resteeps;
  const count = min === max ? `${min}` : `${min}–${max}`;
  const noun = max === 1 ? "steep" : "steeps";
  const add =
    addSeconds % 60 === 0 ? `${addSeconds / 60} min` : `${addSeconds} s`;
  return `${count} more ${noun}, add ${add} each.`;
};

/** How a fact reads in the grid: `80 °C`, `3:00`, `2.5 g`, `250 ml`. */
export const formatBrewFact = (fact: Pick<BrewFact, "key" | "value">) => {
  switch (fact.key) {
    case "waterTempC":
      return `${fact.value} °C`;
    case "steepSeconds": {
      const m = Math.floor(fact.value / 60);
      const s = Math.round(fact.value % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    }
    case "doseGrams":
      return `${fact.value} g`;
    case "waterMl":
      return `${fact.value} ml`;
  }
};

export const BREW_FACT_LABEL: Readonly<Record<BrewFactKey, string>> = {
  waterTempC: "Water",
  steepSeconds: "Time",
  doseGrams: "Dose",
  waterMl: "Water amount",
};
