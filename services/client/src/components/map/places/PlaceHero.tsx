import Image from "next/image";
import type { ReactNode } from "react";
import {
  Cocktail,
  ICON_STROKE,
  Place,
  Restaurant,
} from "@/components/app/icons";
import { PageHero } from "@/components/app/Page";
import { TypeGlyph } from "@/components/app/TypeChip";

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

const GLYPH_CLASS = "size-10 text-glyph";

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
  /** The category slug the glyph comes from. */
  category: string | null | undefined;
  /** The categories as printed: "Coffee shop · Café". */
  categoryLabel?: string | null;
  /** A real photo: drawn in the frame, so the glyph plate never shows. */
  photoUrl?: string | null;
  /** The hero bar's discs (`HERO_DISC`): back at the left, the rest right. */
  back?: ReactNode;
  actions?: ReactNode;
  /** A page-sized `Heart` beside the name. */
  heart?: ReactNode;
  className?: string;
};

/**
 * The place page's hero (Places-Place 01, 20): KIT § 3's page hero — the
 * photo 300 high under glass discs, the name in t-title below it (never on
 * the photo: LIGHT-places ruling 2), the categories in t-cap. With no photo
 * the frame is the raised well with the category's glyph (KIT "No-photo
 * plate"), so the page does not jump when a photo arrives.
 */
export function PlaceHero({
  name,
  category,
  categoryLabel,
  photoUrl,
  back,
  actions,
  heart,
  className,
}: PlaceHeroProps) {
  const tone = placeTone(category);
  const hasPhoto =
    photoUrl !== null && photoUrl !== undefined && photoUrl !== "";
  return (
    <div
      data-slot="place-hero"
      data-tone={tone}
      data-photo={hasPhoto ? "true" : "false"}
      className="contents"
    >
      <PageHero
        className={className}
        title={name}
        back={back}
        actions={actions}
        heart={heart}
        meta={
          categoryLabel === null ||
          categoryLabel === undefined ||
          categoryLabel === ""
            ? undefined
            : categoryLabel
        }
        photo={
          hasPhoto ? (
            <Image
              src={photoUrl}
              alt=""
              fill
              sizes="(max-width: 720px) 100vw, 720px"
            />
          ) : (
            <div
              aria-hidden
              data-slot="place-hero-glyph"
              className="absolute inset-0 flex items-center justify-center pb-10"
            >
              {TONE_GLYPH[tone]()}
            </div>
          )
        }
      />
    </div>
  );
}
