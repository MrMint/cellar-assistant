"use client";

import {
  type AppIcon,
  Cocktail,
  Home,
  ICON_STROKE,
  People,
  Place,
  Pour,
  Store,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { pressFeedback } from "@/components/app/overlays/press";
import {
  SEARCH_SECTIONS,
  SECTION_LABELS,
  type SearchSection,
  scopeHref,
} from "../universal-search";

const GLYPHS: Readonly<Record<SearchSection, AppIcon>> = {
  bottles: Home,
  items: Pour,
  places: Place,
  recipes: Cocktail,
  people: People,
  brands: Store,
};

/**
 * No query (Recipes-Search 01): "Look in" and six tiles, one per section,
 * each narrowing the field to that section (`?in=`). Three across at 390,
 * six across from `md` (desk-01).
 */
export function LookIn() {
  const press = pressFeedback();
  return (
    <section aria-labelledby="search-look-in" className="flex flex-col gap-3">
      <h2 id="search-look-in" className="t-head m-0 text-ink">
        Look in
      </h2>
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 md:grid-cols-6">
        {SEARCH_SECTIONS.map((section) => {
          const Glyph = GLYPHS[section];
          return (
            <li key={section}>
              <Link
                href={scopeHref(section, "")}
                underline="none"
                data-search-look-in={section}
                {...press}
                className="flex min-h-[88px] flex-col justify-between gap-2 rounded-md border border-edge bg-card p-3 text-ink transition-transform duration-(--ca-dur-micro) ease-standard active:scale-97 motion-reduce:active:scale-100"
              >
                <Glyph
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-6 text-act-ink"
                />
                <span className="t-head">{SECTION_LABELS[section]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
