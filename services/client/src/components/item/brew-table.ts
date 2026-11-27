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

/** KIT § 4: a narrow no-break space before a unit ("93 °C"). */
const NNBSP = "\u202F";

/** How a fact reads in the grid: `80 °C`, `3:00`, `2.5 g`, `250 ml`. */
export const formatBrewFact = (fact: Pick<BrewFact, "key" | "value">) => {
  switch (fact.key) {
    case "waterTempC":
      return `${fact.value}${NNBSP}°C`;
    case "steepSeconds": {
      const m = Math.floor(fact.value / 60);
      const s = Math.round(fact.value % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    }
    case "doseGrams":
      return `${fact.value}${NNBSP}g`;
    case "waterMl":
      return `${fact.value}${NNBSP}ml`;
  }
};

export const BREW_FACT_LABEL: Readonly<Record<BrewFactKey, string>> = {
  waterTempC: "Water temp",
  steepSeconds: "Time",
  doseGrams: "Dose",
  waterMl: "Water",
};

/** A tile's or a field's label: the dose names the leaf ("Coffee", "Tea"). */
export const brewFactLabel = (key: BrewFactKey, itemType: string): string =>
  key === "doseGrams"
    ? itemType === "COFFEE"
      ? "Coffee"
      : itemType === "TEA"
        ? "Tea"
        : BREW_FACT_LABEL.doseGrams
    : BREW_FACT_LABEL[key];

/** The unit a field shows inside its box. */
export const BREW_FIELD_UNIT: Readonly<Record<BrewFactKey, string>> = {
  waterTempC: "°C",
  steepSeconds: "m:ss",
  doseGrams: "g",
  waterMl: "ml",
};

export type BrewFieldResult =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly reason: string };

const LIMITS: Readonly<Record<BrewFactKey, number>> = {
  waterTempC: 100,
  steepSeconds: 60 * 60,
  doseGrams: 1000,
  waterMl: 5000,
};

/**
 * One "Your numbers" field, as typed. Empty keeps the typical number
 * (`null`); time takes m:ss or plain seconds; anything else is a reason the
 * field shows under its outline, never a silent guess.
 */
export const parseBrewField = (
  key: BrewFactKey,
  raw: string,
): BrewFieldResult => {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (key === "steepSeconds") {
    const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
    const seconds = clock
      ? Number(clock[1]) * 60 + Number(clock[2])
      : /^\d+$/.test(text)
        ? Number(text)
        : Number.NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return { ok: false, reason: "Use m:ss, like 3:20" };
    }
    if (seconds > LIMITS.steepSeconds) {
      return { ok: false, reason: "Up to 60:00" };
    }
    return { ok: true, value: seconds };
  }
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, reason: "A number above 0" };
  }
  if (n > LIMITS[key]) {
    return {
      ok: false,
      reason: `Up to ${LIMITS[key]}${NNBSP}${BREW_FIELD_UNIT[key]}`,
    };
  }
  return {
    ok: true,
    value: key === "waterTempC" ? Math.round(n) : Math.round(n * 10) / 10,
  };
};

export type BrewPrefsVariables = {
  readonly itemType: "TEA" | "COFFEE";
  readonly itemId: string;
  readonly waterTempC: number | null;
  readonly steepSeconds: number | null;
  readonly doseGrams: number | null;
  readonly waterMl: number | null;
};

/**
 * The one write the brew guide makes, `setBrewPrefs`: the item and the four
 * numbers, nothing that names a person (the API keeps them on the viewer's
 * own UserActor). Only a tea or a coffee has brew numbers; anything else is
 * `null`, and nothing is sent.
 */
export const brewPrefsVariables = (
  itemType: string,
  itemId: string,
  numbers: BrewNumbers,
): BrewPrefsVariables | null => {
  if (itemType !== "TEA" && itemType !== "COFFEE") return null;
  return {
    itemType,
    itemId,
    waterTempC: numbers.waterTempC,
    steepSeconds: numbers.steepSeconds,
    doseGrams: numbers.doseGrams,
    waterMl: numbers.waterMl,
  };
};
