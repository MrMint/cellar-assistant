import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** The `@utility type-*` classes in `globals.css` (design §3.2). */
export const TYPE_RAMP = [
  "type-large-title",
  "type-title-1",
  "type-title-2",
  "type-headline",
  "type-body",
  "type-callout",
  "type-footnote",
  "type-overline",
  "type-numeral-xl",
] as const;

/** The app's own colour roles (`@theme inline` in `globals.css`). */
const APP_COLORS = [
  "surface-1",
  "surface-2",
  "surface-3",
  "line",
  "ink-1",
  "ink-2",
  "ink-3",
  "brass",
  "on-brass",
  "brand",
  "brand-ink",
  "ai",
  "success",
  "danger",
  ...["wine", "beer", "spirit", "sake", "coffee", "tea"].flatMap((t) => [
    `type-${t}`,
    `type-${t}-text`,
  ]),
  "band-1",
  "band-2",
  "band-3",
  "band-4",
  "band-5",
];

/**
 * tailwind-merge, taught the custom tokens. Without this, `type-*` classes
 * are unknown to it, so `cn("type-callout", "type-body")` keeps both and the
 * stylesheet's order — not the caller's — decides which wins.
 *
 * A `type-*` class sets family, size, line height and weight together, so a
 * later one replaces an earlier `text-sm`/`leading-*`/`font-*`; a later
 * single-property class still layers on top of it (it is emitted after the
 * multi-property utility).
 */
const twMerge = extendTailwindMerge<"type-ramp" | "tabular">({
  extend: {
    theme: { color: APP_COLORS },
    classGroups: {
      "type-ramp": [...TYPE_RAMP],
      tabular: ["tabular"],
    },
    conflictingClassGroups: {
      "type-ramp": ["font-size", "leading", "font-weight", "font-family"],
    },
  },
});

/** Join class names, later ones winning a conflict. Use it for every merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
