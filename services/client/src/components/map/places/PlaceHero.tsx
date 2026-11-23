import Image from "next/image";
import type { ReactNode } from "react";
import {
  Cocktail,
  ICON_STROKE,
  Place,
  Restaurant,
} from "@/components/app/icons";
import { TypeGlyph } from "@/components/app/TypeChip";
import { cn } from "@/lib/utils";

/**
 * B03: a place with no photo gets a tonal hero from its category's hue —
 * never a stock photo. A real photo, when there is one, always wins, in the
 * same frame, so the page does not jump when it arrives.
 */
export const PLACE_TONES = [
  "wine",
  "beer",
  "spirit",
  "sake",
  "coffee",
  "tea",
  "food",
  "neutral",
] as const;

export type PlaceTone = (typeof PLACE_TONES)[number];

/**
 * Category words → tone, first match wins. Categories are snake_case slugs
 * (`wine_bar`, `coffee_shop`, Overture's `italian_restaurant`); a word
 * matches a whole slug segment, so `bar` is not `barbecue`.
 */
export const PLACE_TONE_RULES: readonly (readonly [string, PlaceTone])[] = [
  ["wine", "wine"],
  ["winery", "wine"],
  ["vineyard", "wine"],
  ["sake", "sake"],
  ["izakaya", "sake"],
  ["tea", "tea"],
  ["coffee", "coffee"],
  ["cafe", "coffee"],
  ["espresso", "coffee"],
  ["roaster", "coffee"],
  ["beer", "beer"],
  ["brewery", "beer"],
  ["brewpub", "beer"],
  ["taproom", "beer"],
  ["pub", "beer"],
  ["distillery", "spirit"],
  ["liquor", "spirit"],
  ["cocktail", "spirit"],
  ["bar", "spirit"],
  ["lounge", "spirit"],
  ["restaurant", "food"],
  ["bakery", "food"],
  ["food", "food"],
  ["bistro", "food"],
];

export const placeTone = (category: string | null | undefined): PlaceTone => {
  if (category === null || category === undefined) return "neutral";
  const segments = new Set(category.toLowerCase().split(/[^a-z0-9]+/));
  for (const [word, tone] of PLACE_TONE_RULES) {
    if (segments.has(word)) return tone;
  }
  return "neutral";
};

/**
 * Each tone's three layers, as literal Tailwind classes over surface-1: the
 * wash (the hue deep), the large ring (the text-safe hue, ~22%), the small
 * ring (ink at 10%). Ink-1 text sits on every wash.
 */
const TONE_CLASSES: Readonly<
  Record<PlaceTone, { wash: string; ring: string }>
> = {
  wine: { wash: "bg-type-wine/45", ring: "bg-type-wine-text/22" },
  beer: { wash: "bg-type-beer/30", ring: "bg-type-beer-text/24" },
  spirit: { wash: "bg-type-spirit/35", ring: "bg-type-spirit-text/24" },
  sake: { wash: "bg-type-sake/35", ring: "bg-type-sake-text/22" },
  coffee: { wash: "bg-type-coffee/45", ring: "bg-type-coffee-text/24" },
  tea: { wash: "bg-type-tea/35", ring: "bg-type-tea-text/22" },
  food: { wash: "bg-brand/40", ring: "bg-brand-ink/22" },
  neutral: { wash: "bg-surface-3", ring: "bg-ink-3/18" },
};

const GLYPH_CLASS = "size-7 text-ink-1";

/** The tone's glyph: the item type's own, a cocktail, a dish, or a pin. */
const TONE_GLYPH: Readonly<Record<PlaceTone, () => ReactNode>> = {
  wine: () => <TypeGlyph type="WINE" className={GLYPH_CLASS} />,
  beer: () => <TypeGlyph type="BEER" className={GLYPH_CLASS} />,
  spirit: () => (
    <Cocktail aria-hidden strokeWidth={ICON_STROKE} className={GLYPH_CLASS} />
  ),
  sake: () => <TypeGlyph type="SAKE" className={GLYPH_CLASS} />,
  coffee: () => <TypeGlyph type="COFFEE" className={GLYPH_CLASS} />,
  tea: () => <TypeGlyph type="TEA" className={GLYPH_CLASS} />,
  food: () => (
    <Restaurant aria-hidden strokeWidth={ICON_STROKE} className={GLYPH_CLASS} />
  ),
  neutral: () => (
    <Place aria-hidden strokeWidth={ICON_STROKE} className={GLYPH_CLASS} />
  ),
};

export type PlaceHeroProps = {
  name: string;
  /** The category slug the tone and glyph come from. */
  category: string | null | undefined;
  /** The category as printed: "Wine bar". */
  categoryLabel?: string | null;
  /** A real photo: drawn over the tone, which then never shows. */
  photoUrl?: string | null;
  className?: string;
};

/**
 * The place page's hero (Main board): a 20 px-rounded tonal card, two soft
 * rings and the category's glyph at its top right, the name in Fraunces and
 * the category under it at the bottom left. The name is the page's `h1`, in
 * the app's title style (Fraunces 28 px; the board's 20 px is a 3-up tile).
 */
export function PlaceHero({
  name,
  category,
  categoryLabel,
  photoUrl,
  className,
}: PlaceHeroProps) {
  const tone = placeTone(category);
  const classes = TONE_CLASSES[tone];
  const hasPhoto =
    photoUrl !== null && photoUrl !== undefined && photoUrl !== "";
  return (
    <div
      data-slot="place-hero"
      data-tone={tone}
      data-photo={hasPhoto ? "true" : "false"}
      className={cn(
        "relative isolate flex h-40 flex-col justify-end overflow-hidden rounded-[20px] bg-surface-1 p-4",
        className,
      )}
    >
      {hasPhoto ? (
        <>
          <Image
            src={photoUrl}
            alt=""
            fill
            sizes="(max-width: 720px) 100vw, 720px"
            className="-z-10 object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className={cn("absolute inset-0", classes.wash)} />
          <div
            className={cn(
              "absolute -top-8 -right-8 size-38 rounded-full",
              classes.ring,
            )}
          />
          <div className="absolute top-6 right-6 size-16 rounded-full bg-ink-1/10" />
          <div
            data-slot="place-hero-glyph"
            className="absolute top-10 right-10 text-ink-1"
          >
            {TONE_GLYPH[tone]()}
          </div>
        </div>
      )}
      <h1 className="type-title-1 text-ink-1">{name}</h1>
      {categoryLabel !== null &&
        categoryLabel !== undefined &&
        categoryLabel !== "" && (
          <p className="type-footnote relative text-ink-1/86">
            {categoryLabel}
          </p>
        )}
    </div>
  );
}
