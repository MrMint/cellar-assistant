/**
 * What differed between the six old `{T}Details` / `Cellar{T}Details`
 * components, as data — so one `ItemPageView` and one `CellarItemPageView`
 * replace twelve near-identical files (inventory §5, Items).
 *
 * Read off `82450ad1:src/components/{wine,beer,spirit,coffee,sake,tea}/`:
 *
 * - `fallback`: the picture shown when the item has no image.
 * - `brandTitle` / `cellarBrandTitle`: the `ItemBrands` heading on each page
 *   (they were not the same: "Wine Brands" on the item page, "Wineries" on the
 *   bottle page).
 * - `brandsColumn`: wine, sake and tea listed brands in the right-hand column
 *   under the reviews; beer, spirit and coffee in the left one above "On
 *   Lists".
 * - `recipes` / `cellarRecipes`: "Used in Recipes". Beer, spirit and coffee
 *   fetched `recipe_ingredients` and never rendered them; wine showed them on
 *   the item page only, sake and tea on both pages.
 * - `characteristicsTitle`: sake's and tea's chip card ("Sake
 *   Characteristics"); the chips themselves are `itemCharacteristics`.
 *
 * `CompactRecipeRecommendations` (wine, sake, tea) is not restored: it needs
 * G29, which stays dropped (it was invisible in production anyway).
 */

import type { StaticImageData } from "next/image";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import sake1 from "@/images/sake1.png";
import spirit1 from "@/images/spirit1.png";
import tea1 from "@/images/tea1.png";
import wine1 from "@/images/wine1.png";

export type ItemViewConfig = {
  fallback: StaticImageData;
  brandTitle: string;
  cellarBrandTitle: string;
  brandsColumn: "left" | "right";
  recipes: boolean;
  cellarRecipes: boolean;
  characteristicsTitle: string | null;
};

export const ITEM_VIEW_CONFIG = {
  WINE: {
    fallback: wine1,
    brandTitle: "Wine Brands",
    cellarBrandTitle: "Wineries",
    brandsColumn: "right",
    recipes: true,
    cellarRecipes: false,
    characteristicsTitle: null,
  },
  BEER: {
    fallback: beer1,
    brandTitle: "Breweries",
    cellarBrandTitle: "Beer Brands",
    brandsColumn: "left",
    recipes: false,
    cellarRecipes: false,
    characteristicsTitle: null,
  },
  SPIRIT: {
    fallback: spirit1,
    brandTitle: "Distilleries",
    cellarBrandTitle: "Spirit Brands",
    brandsColumn: "left",
    recipes: false,
    cellarRecipes: false,
    characteristicsTitle: null,
  },
  COFFEE: {
    fallback: coffee1,
    brandTitle: "Roasters",
    cellarBrandTitle: "Roasters",
    brandsColumn: "left",
    recipes: false,
    cellarRecipes: false,
    characteristicsTitle: null,
  },
  SAKE: {
    fallback: sake1,
    brandTitle: "Breweries",
    cellarBrandTitle: "Breweries",
    brandsColumn: "right",
    recipes: true,
    cellarRecipes: true,
    characteristicsTitle: "Sake Characteristics",
  },
  TEA: {
    fallback: tea1,
    brandTitle: "Tea Brands",
    cellarBrandTitle: "Brands",
    brandsColumn: "right",
    recipes: true,
    cellarRecipes: true,
    characteristicsTitle: "Tea Characteristics",
  },
} as const satisfies Record<ApiItemType, ItemViewConfig>;
