/**
 * The design tokens, as values (the 2026-11 kit: `docs/design/2026-11`
 * KIT § 1 and LIGHT § 1/§ 4, which wins where the two differ).
 *
 * `src/app/globals.css` is where the app *reads* them: every `--ca-*` custom
 * property in its dark `:root` block mirrors `cssVars` here, and every one in
 * its `[data-theme="light"]` block mirrors `cssVarsLight`;
 * `dev-checks/tokens-parity.test.ts` fails when they drift. This module exists
 * for the code that cannot read a CSS variable:
 *
 * - MapLibre paint and `<canvas>` drawing;
 * - images that leave the app (og cards, the recap share card), which are
 *   always drawn from the dark values (`darkValues`) whatever the theme;
 * - the pre-paint theme script and `viewport.themeColor`;
 * - contrast tests.
 *
 * Everything else uses the Tailwind roles (`bg-surface-1`, `text-ink-3`,
 * `bg-primary`, `text-gold`, …) and never imports this file. It is one of the
 * few files the `ui-platform` guard lets hold a raw colour.
 *
 * Kit name → token: bg `--ca-bg`; card `--ca-surface-1`; raised
 * `--ca-surface-2`; sel `--ca-surface-3`; edge `--ca-line`; act `--ca-accent`;
 * on-act `--ca-on-accent`; dng `--ca-danger`; k5..k1 `--ca-band-5..1`; on-k
 * `--ca-on-band`; k-edge `--ca-band-edge`; every other kit name is
 * `--ca-<kit name>` (`--ca-edge-2`, `--ca-act-ink`, `--ca-sh-pop`, …).
 */

/** Dark, the kit's first theme. Keys are what `cssVars` maps to `--ca-*`. */
export const color = {
  bg: "#111015",
  /** card */
  surface1: "#221f2a",
  /** raised; also the no-photo well */
  surface2: "#332f3e",
  /** sel: pressed and selected */
  surface3: "#443f53",
  /** edge: decorative boundaries (tiles, cards, segmented controls). */
  line: "#433f4d",
  /** Input boundaries (fields, pickers, steppers, search), 3:1 (ruling 1). */
  edge2: "#71678a",
  /** Row dividers. */
  hair: "#2c2936",
  /** Section rules. */
  rule: "#3c3847",
  /** Dashed add outlines, board-note dash, desktop hover edge. */
  dash: "#736d89",
  /** The 1 px top highlight on glass surfaces (`surface-glass`). */
  highlight: "rgb(255 255 255 / 0.06)",
  ink1: "#ffffff",
  ink2: "#b8b5c0",
  ink3: "#aea9bd",
  /** Icons that are not text (3:1 minimum). */
  glyph: "#857e9f",
  /** act: action fills (primary, Add, switch on). Teal, not brass. */
  accent: "#70a2a9",
  /** on-act: ink on an action fill. */
  onAccent: "#111015",
  /** Action text, links, focus ring, Undo. */
  actInk: "#8cc0c6",
  /** Teal on glass, both themes. */
  actOnGlass: "#8cc0c6",
  /** Legacy name of the AI mark; now act-ink (the AI is marked by glyph and words). */
  ai: "#8cc0c6",
  /** The owner's own verdict (stars). `--color-brass` points here (L27). */
  gold: "#d59d24",
  /** Hearts only. */
  heart: "#fe0000",
  /** dng: text and outline only, never solid. */
  danger: "#f0c5c8",
  /** Not in the kit; kept so existing screens keep their colour. */
  brand: "#7b2233",
  brandInk: "#d98796",
  success: "#6faf7b",
  /** on-k: ink on a band fill (both themes). */
  onBand: "#111015",
  /** k-edge: a band's inset ring (`box-shadow: inset 0 0 0 1px`). */
  bandEdge: "transparent",
  /** Map "you are here". */
  here: "#3d7ef0",
  scrim: "rgba(8,7,12,.62)",
  /** Quick-look scrim. */
  scrimPk: "rgba(8,7,12,.78)",
  /** Discs and pills over photos (both themes). */
  glass: "rgba(17,16,21,.86)",
  /** Desktop disc hover (both themes). */
  glassHover: "rgba(17,16,21,.96)",
  onGlass: "#ffffff",
  /** The toast is an inverse surface: it stays dark in light. */
  toast: "#332f3e",
  toastEdge: "#71678a",
  toastInk: "#ffffff",
  toastAct: "#8cc0c6",
  skel: "#3c3847",
  /** Board-note fill. */
  note: "rgba(17,16,21,.94)",
  /** Desktop 2 px selection ring. */
  ring: "#e6e3ee",
  shBar: "0 10px 12px -10px rgba(4,3,8,.9)",
  shBarUp: "0 -10px 12px -10px rgba(4,3,8,.9)",
  shPop: "0 12px 32px rgba(4,3,8,.6)",
  shDlg: "0 20px 48px rgba(4,3,8,.7)",
  shPin: "0 2px 6px rgba(4,3,8,.55)",
  shPinOn: "0 3px 10px rgba(4,3,8,.7)",
  shYou: "0 0 0 2px rgba(17,16,21,.5),0 1px 6px rgba(4,3,8,.7)",
  shDock: "0 -6px 20px rgba(4,3,8,.45)",
} as const;

export type PaletteKey = keyof typeof color;
export type Palette = Readonly<Record<PaletteKey, string>>;

/** Light (LIGHT § 1 and § 4, with the light round's additions). */
export const light: Palette = {
  bg: "#f5f4f8",
  surface1: "#ffffff",
  surface2: "#ebe9f0",
  surface3: "#dedbe7",
  line: "#d6d3de",
  edge2: "#867f99",
  hair: "#e4e2ea",
  rule: "#e1dee7",
  dash: "#8f89a1",
  highlight: "rgb(255 255 255 / 0.6)",
  ink1: "#17151c",
  ink2: "#4a4656",
  ink3: "#5c576b",
  glyph: "#7d7791",
  accent: "#5f949b",
  onAccent: "#0e0d12",
  actInk: "#2d6a71",
  actOnGlass: "#8cc0c6",
  ai: "#2d6a71",
  gold: "#a2700c",
  heart: "#e0001b",
  danger: "#b3261e",
  /** Not in the kit: darkened to ≥ 4.5:1 on bg, card and raised. */
  brand: "#9c2f43",
  brandInk: "#b83a50",
  success: "#407349",
  onBand: "#111015",
  bandEdge: "rgba(17,16,21,.4)",
  here: "#3d7ef0",
  scrim: "rgba(23,21,28,.42)",
  scrimPk: "rgba(23,21,28,.62)",
  glass: "rgba(17,16,21,.86)",
  glassHover: "rgba(17,16,21,.96)",
  onGlass: "#ffffff",
  toast: "#2a2733",
  toastEdge: "#2a2733",
  toastInk: "#ffffff",
  toastAct: "#8cc0c6",
  skel: "#e2dfe8",
  note: "rgba(255,255,255,.96)",
  ring: "#17151c",
  shBar: "0 10px 12px -10px rgba(40,36,52,.22)",
  shBarUp: "0 -10px 12px -10px rgba(40,36,52,.22)",
  shPop: "0 12px 32px rgba(40,36,52,.18)",
  shDlg: "0 20px 48px rgba(40,36,52,.24)",
  shPin: "0 2px 6px rgba(40,36,52,.32)",
  shPinOn: "0 3px 10px rgba(40,36,52,.36)",
  shYou: "0 0 0 2px rgba(40,36,52,.24),0 1px 6px rgba(40,36,52,.32)",
  shDock: "0 -6px 20px rgba(40,36,52,.18)",
};

/**
 * The dark values, for images that leave the app (og cards, the recap share
 * card, link previews) and the manifest: those are dark whatever the theme.
 */
export const darkValues: Palette = color;

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

type TypeHues = Readonly<Record<TokenItemType, { deep: string; text: string }>>;

/**
 * Per type (not in the kit): `deep` for pins and rules, `text` for text, at
 * ≥ 4.5:1 on bg, card and raised and on its own TypeChip tint (lightened from
 * the old values for the kit's lighter raised surface).
 */
export const itemTypeColor: TypeHues = {
  WINE: { deep: "#8e2a3a", text: "#d98796" },
  BEER: { deep: "#c98a2b", text: "#daa350" },
  SPIRIT: { deep: "#9a6a3c", text: "#ce9e6f" },
  SAKE: { deep: "#5e6fa8", text: "#99a5d4" },
  COFFEE: { deep: "#6b4a3a", text: "#c09781" },
  TEA: { deep: "#5e8c6a", text: "#85b492" },
};

/** The same in light: `text` darkened to ≥ 4.5:1 on bg, card, raised and its tint. */
export const itemTypeColorLight: TypeHues = {
  WINE: { deep: "#8e2a3a", text: "#9b3144" },
  BEER: { deep: "#c98a2b", text: "#7f581b" },
  SPIRIT: { deep: "#9a6a3c", text: "#7e542b" },
  SAKE: { deep: "#5e6fa8", text: "#4457a4" },
  COFFEE: { deep: "#6b4a3a", text: "#78513d" },
  TEA: { deep: "#5e8c6a", text: "#3f6649" },
};

/** Tier bands k5 → k1, the same in both themes; ink on them is `onBand`. */
export const bandColor: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = {
  5: "#4fb469",
  4: "#9cc25a",
  3: "#e5c84a",
  2: "#ec8f3e",
  1: "#e8615a",
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

/**
 * How long a loading shell's placeholder blocks wait before they fade in
 * (design §4.7, X24: "shown only after 120 ms"). A route that answers inside
 * this window never flashes grey boxes; its shell's static chrome (the title,
 * the search pill) is visible from the first frame regardless.
 */
export const SKELETON_REVEAL_DELAY_MS = 120;

const bezier = (p: readonly number[]) => `cubic-bezier(${p.join(", ")})`;

/** Palette key → custom property. */
export const PALETTE_VAR: Readonly<Record<PaletteKey, string>> = {
  bg: "--ca-bg",
  surface1: "--ca-surface-1",
  surface2: "--ca-surface-2",
  surface3: "--ca-surface-3",
  line: "--ca-line",
  edge2: "--ca-edge-2",
  hair: "--ca-hair",
  rule: "--ca-rule",
  dash: "--ca-dash",
  highlight: "--ca-highlight",
  ink1: "--ca-ink-1",
  ink2: "--ca-ink-2",
  ink3: "--ca-ink-3",
  glyph: "--ca-glyph",
  accent: "--ca-accent",
  onAccent: "--ca-on-accent",
  actInk: "--ca-act-ink",
  actOnGlass: "--ca-act-on-glass",
  ai: "--ca-ai",
  gold: "--ca-gold",
  heart: "--ca-heart",
  danger: "--ca-danger",
  brand: "--ca-brand",
  brandInk: "--ca-brand-ink",
  success: "--ca-success",
  onBand: "--ca-on-band",
  bandEdge: "--ca-band-edge",
  here: "--ca-here",
  scrim: "--ca-scrim",
  scrimPk: "--ca-scrim-pk",
  glass: "--ca-glass",
  glassHover: "--ca-glass-hover",
  onGlass: "--ca-on-glass",
  toast: "--ca-toast",
  toastEdge: "--ca-toast-edge",
  toastInk: "--ca-toast-ink",
  toastAct: "--ca-toast-act",
  skel: "--ca-skel",
  note: "--ca-note",
  ring: "--ca-ring",
  shBar: "--ca-sh-bar",
  shBarUp: "--ca-sh-bar-up",
  shPop: "--ca-sh-pop",
  shDlg: "--ca-sh-dlg",
  shPin: "--ca-sh-pin",
  shPinOn: "--ca-sh-pin-on",
  shYou: "--ca-sh-you",
  shDock: "--ca-sh-dock",
};

function themeVars(palette: Palette, types: TypeHues): Record<string, string> {
  return {
    ...Object.fromEntries(
      (Object.keys(PALETTE_VAR) as PaletteKey[]).map((k) => [
        PALETTE_VAR[k],
        palette[k],
      ]),
    ),
    ...Object.fromEntries(
      ITEM_TYPE_ORDER.flatMap((type) => {
        const key = type.toLowerCase();
        return [
          [`--ca-type-${key}`, types[type].deep],
          [`--ca-type-${key}-text`, types[type].text],
        ];
      }),
    ),
  };
}

/**
 * Every `--ca-*` custom property `globals.css` must declare on `:root` (dark),
 * with its value. The parity test compares this map with the stylesheet.
 */
export const cssVars: Readonly<Record<string, string>> = {
  ...themeVars(color, itemTypeColor),
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
  "--ca-skeleton-delay": `${SKELETON_REVEAL_DELAY_MS}ms`,
};

/**
 * What the `[data-theme="light"]` block must redeclare, with its value: every
 * themed token (bands, motion and sizes are the same in both themes).
 */
export const cssVarsLight: Readonly<Record<string, string>> = themeVars(
  light,
  itemTypeColorLight,
);
