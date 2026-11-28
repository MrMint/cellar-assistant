/**
 * The place categories a person can pick when they add a place, and the only
 * ones the AI place review may suggest — **one list, read by both** (D15).
 *
 * `places.categories` is `text[]` with no foreign key, so nothing in the
 * database objects to a category outside this list. What makes the list
 * matter is that the create form renders its options from it
 * (`services/client/src/components/map/places/userPlaceCategories.ts`) and the
 * review's structured-output schema constrains `suggestedCategories` to it
 * (`PLACE_REVIEW_CATEGORIES` in `services/actors/src/lib/ai/prompts.ts`): a
 * suggestion outside it is a word the user cannot act on.
 *
 * These used to be two hand-kept copies, one per app, held equal by a test
 * that read the client's source as text. They now both spread this.
 *
 * D15 added six back that the restored form had dropped (`wine_shop`,
 * `vineyard`, `taproom`, `coffee_roaster`, `tea_shop`, `izakaya`;
 * `docs/archive/nhost-migration/ui-parity-decisions.md` decision 16 records the drop).
 * Slugs, never labels: the column and the form both hold slugs.
 */
export const PLACE_CATEGORY_TIERS = {
  venues: [
    "restaurant",
    "bar",
    "cafe",
    "coffee_shop",
    "cocktail_bar",
    "wine_bar",
    "brewery",
    "winery",
    "vineyard",
    "distillery",
    "pub",
    "beer_bar",
    "taproom",
    "sports_bar",
    "lounge",
    "gastropub",
    "tapas_bar",
    "izakaya",
    "sake_bar",
    "whiskey_bar",
    "beer_garden",
    "wine_tasting_room",
    "coffee_roastery",
    "tea_house",
  ],
  retail: [
    "liquor_store",
    "wine_shop",
    "beer_wine_and_spirits",
    "beverage_store",
    "coffee_roaster",
    "tea_shop",
    "specialty_store",
  ],
} as const;

/** Every selectable category, venues first. */
export const PLACE_CATEGORIES = [
  ...PLACE_CATEGORY_TIERS.venues,
  ...PLACE_CATEGORY_TIERS.retail,
] as const;

export type PlaceCategorySlug = (typeof PLACE_CATEGORIES)[number];

export const isPlaceCategory = (value: string): value is PlaceCategorySlug =>
  (PLACE_CATEGORIES as readonly string[]).includes(value);
