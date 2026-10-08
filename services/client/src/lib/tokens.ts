/**
 * The design tokens, as values (`docs/product/design-direction.md` §3–§4).
 *
 * `src/app/globals.css` is where the app *reads* them — every `--ca-*` custom
 * property there mirrors a value here, and `dev-checks/tokens-parity.test.ts`
 * fails when the two drift. This module exists for the code that cannot read a
 * CSS variable:
 *
 * - **the Joy theme** (`providers/ThemeRegistry.tsx`, until the removal step):
 *   Joy derives its `*Channel` variables from hex and breaks on `var(...)`;
 * - MapLibre paint and `<canvas>` drawing;
 * - contrast tests.
 *
 * Everything else uses the Tailwind roles (`bg-surface-1`, `text-ink-3`,
 * `bg-primary`, …) and never imports this file. It is one of the few files the
 * `ui-platform` guard lets hold a raw hex value.
 */

/** Dark, the default scheme (D21). */
export const color = {
  bg: "#0E0C0F",
  surface1: "#171418",
  surface2: "#1F1B21",
  surface3: "#29242B",
  /** Hairline separators, instead of borders. */
  line: "rgb(255 240 225 / 0.08)",
  /** The 1 px top highlight on raised (level 2–3) surfaces. */
  highlight: "rgb(255 240 225 / 0.06)",
  ink1: "#F3EDE4",
  ink2: "#BDB3A7",
  ink3: "#9C9287",
  /** Brass: *action*, and nothing else. */
  accent: "#C9A15B",
  /** Ink on brass (7.61:1). Never white on brass. */
  onAccent: "#1A1408",
  /** Claret: hearts, the #1 crown, hero washes. */
  brand: "#7B2233",
  brandInk: "#D06A7C",
  /** Teal: AI-drafted or AI-working states only. */
  ai: "#7FB3B9",
  success: "#6FAF7B",
  /** Text and outline; solid only inside a confirm sheet. */
  danger: "#E07A6A",
} as const;

/** "Daylight" (design §3.1): defined now, built only on evidence (D21). */
export const daylight = {
  bg: "#F6F1E8",
  surface1: "#FBF8F2",
  surface2: "#EFE8DC",
  surface3: "#E6DDCD",
  ink1: "#2A2420",
  ink2: "#5E5449",
  ink3: "#6F6357",
  accentText: "#7A5C24",
  accent: "#8A6A2E",
  onAccent: "#FFFFFF",
  ai: "#2F6B70",
  brand: "#9C2F43",
} as const;

/** The one type order, everywhere: wine, beer, spirit, sake, coffee, tea. */
export const ITEM_TYPE_ORDER = [
  "WINE",
  "BEER",
  "SPIRIT",
  "SAKE",
  "COFFEE",
  "TEA",
] as const;

export type TokenItemType = (typeof ITEM_TYPE_ORDER)[number];

/** Per type: `deep` for pins and rules, `text` for text on dark (≥ 4.5:1). */
export const itemTypeColor: Readonly<
  Record<TokenItemType, { deep: string; text: string }>
> = {
  WINE: { deep: "#8E2A3A", text: "#D06A7C" },
  BEER: { deep: "#C98A2B", text: "#C98A2B" },
  SPIRIT: { deep: "#9A6A3C", text: "#C8925E" },
  SAKE: { deep: "#5E6FA8", text: "#8E9BD0" },
  COFFEE: { deep: "#6B4A3A", text: "#B88A72" },
  TEA: { deep: "#5E8C6A", text: "#7FB08C" },
};

/** Tier bands, claret → brass → ash. Unrated (0) sits on surface-3. */
export const bandColor: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = {
  5: "#7B2233",
  4: "#9A4A3A",
  3: "#B8783F",
  2: "#8C7A62",
  1: "#5E5650",
};

/** Motion durations in ms (`lib/motion.ts` holds the same in seconds). */
export const durationMs = {
  micro: 90,
  short: 160,
  medium: 240,
  long: 400,
} as const;

/** Cubic-bézier control points (`lib/motion.ts` re-exports these). */
export const easing = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0, 1],
  exit: [0.3, 0, 1, 1],
} as const;

/** Height of the tab bar, before the bottom safe area. */
export const TAB_BAR_HEIGHT_PX = 49;

const bezier = (p: readonly number[]) => `cubic-bezier(${p.join(", ")})`;

/**
 * Every `--ca-*` custom property `globals.css` must declare on `:root`, with
 * its value. The parity test compares this map with the stylesheet.
 */
export const cssVars: Readonly<Record<string, string>> = {
  "--ca-bg": color.bg,
  "--ca-surface-1": color.surface1,
  "--ca-surface-2": color.surface2,
  "--ca-surface-3": color.surface3,
  "--ca-line": color.line,
  "--ca-highlight": color.highlight,
  "--ca-ink-1": color.ink1,
  "--ca-ink-2": color.ink2,
  "--ca-ink-3": color.ink3,
  "--ca-accent": color.accent,
  "--ca-on-accent": color.onAccent,
  "--ca-brand": color.brand,
  "--ca-brand-ink": color.brandInk,
  "--ca-ai": color.ai,
  "--ca-success": color.success,
  "--ca-danger": color.danger,
  ...Object.fromEntries(
    ITEM_TYPE_ORDER.flatMap((type) => {
      const key = type.toLowerCase();
      return [
        [`--ca-type-${key}`, itemTypeColor[type].deep],
        [`--ca-type-${key}-text`, itemTypeColor[type].text],
      ];
    }),
  ),
  "--ca-band-5": bandColor[5],
  "--ca-band-4": bandColor[4],
  "--ca-band-3": bandColor[3],
  "--ca-band-2": bandColor[2],
  "--ca-band-1": bandColor[1],
  "--ca-dur-micro": `${durationMs.micro}ms`,
  "--ca-dur-short": `${durationMs.short}ms`,
  "--ca-dur-medium": `${durationMs.medium}ms`,
  "--ca-dur-long": `${durationMs.long}ms`,
  "--ca-ease-standard": bezier(easing.standard),
  "--ca-ease-enter": bezier(easing.enter),
  "--ca-ease-exit": bezier(easing.exit),
  "--ca-tabbar-h": `${TAB_BAR_HEIGHT_PX}px`,
};

/**
 * Ramps for the Joy theme only (deleted with Joy in the removal step). Each is
 * built around a token: brass 500 is `color.accent`; the warm neutral ramp
 * runs through the inks (100/300/400) and surfaces (800/900); danger 400 and
 * success 400 are the danger and success hues.
 */
export const joyRamps = {
  brass: {
    50: "#FBF6EC",
    100: "#F4E9D3",
    200: "#E9D5AE",
    300: "#DDBF87",
    400: "#D3AF70",
    500: color.accent,
    600: "#A9843F",
    700: "#84662F",
    800: "#5F4921",
    900: "#3B2D14",
  },
  neutral: {
    50: "#FAF7F2",
    100: color.ink1,
    200: "#DCD3C8",
    300: color.ink2,
    400: color.ink3,
    500: "#7A7168",
    600: "#5C544E",
    700: "#3D363C",
    800: color.surface3,
    900: color.surface2,
  },
  danger: {
    50: "#FCEFEC",
    100: "#F8DAD4",
    200: "#F0B4A9",
    300: "#E8978A",
    400: color.danger,
    500: "#C9604F",
    600: "#A64A3B",
    700: "#7F382C",
    800: "#59271F",
    900: "#3A1913",
  },
  success: {
    50: "#EFF7F0",
    100: "#D7EBDA",
    200: "#B1D7B8",
    300: "#90C49A",
    400: color.success,
    500: "#57955F",
    600: "#45784C",
    700: "#355B3A",
    800: "#243F28",
    900: "#172819",
  },
  /** One step above surface-3, for Joy's `background.level3`. */
  surface4: "#332D35",
} as const;
