import { AddReview } from "@/components/review/AddReview";
import type { ItemView } from "./adapter";
import { ChangeBrand } from "./ChangeBrand";
import { ItemBrands, shownItemBrand } from "./ItemBrands";
import { type ItemCellar, ItemCellars } from "./ItemCellars";
import { ItemCharacteristics } from "./ItemCharacteristics";
import ItemDetails from "./ItemDetails";
import { ItemHeaderServer } from "./ItemHeaderServer";
import { ItemImage } from "./ItemImage";
import { type ItemRecipeIngredient, ItemRecipes } from "./ItemRecipes";
import { ItemReviews } from "./ItemReviews";
import { type ItemTierListEntry, ItemTierLists } from "./ItemTierLists";
import { ITEM_VIEW_CONFIG } from "./itemViewConfig";

export type ItemPageViewProps = {
  item: ItemView;
  cellars: ItemCellar[];
  /** Exact counts where the API stops a list at 100 rows (null: unknown). */
  cellarsTotal?: number | null;
  tierLists: ItemTierListEntry[];
  tierListsTotal?: number | null;
  recipes: ItemRecipeIngredient[];
  recipesTotal?: number | null;
  /** The viewer's cellars "Add to Cellar" offers. */
  addableCellars: { id: string; name: string }[];
  editHref: string | null;
};

/**
 * The six `82450ad1:src/components/{wine,…}/{T}Details.tsx`, as one view over
 * `ITEM_VIEW_CONFIG` (inventory §5). Same grid: the image on the left third
 * (Share, which sat under it, is the header bar's action now — N26);
 * details, characteristics, "Located in:" and "On Lists" in the middle;
 * review form, reviews, brands and recipes on the right — with each type's
 * brands heading and column, and recipes only where the old page had them.
 */
export function ItemPageView({
  item,
  cellars,
  cellarsTotal,
  tierLists,
  tierListsTotal,
  recipes,
  recipesTotal,
  addableCellars,
  editHref,
}: ItemPageViewProps) {
  const config = ITEM_VIEW_CONFIG[item.type];
  // D8: the creator — the one person `editHref` is set for — can correct the
  // brand from here in one tap.
  const brands = (
    <ItemBrands
      brands={item.brands}
      title={config.brandTitle}
      change={
        editHref === null ? undefined : (
          <ChangeBrand
            type={item.type}
            itemId={item.itemId}
            itemName={item.name}
            shown={shownItemBrand(item.brands)}
          />
        )
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <ItemHeaderServer
        itemId={item.itemId}
        itemName={item.name}
        itemType={item.type}
        cellars={addableCellars}
        editHref={editHref}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <ItemImage
            url={item.image?.url}
            placeholder={item.image?.placeholder}
            fallback={config.fallback}
          />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:col-span-2 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <ItemDetails
              itemId={item.itemId}
              type={item.type}
              isFavorite={item.isFavorite}
              title={item.name}
              subTitlePhrases={item.subTitlePhrases}
              description={item.description}
            />
            <ItemCharacteristics
              title={config.characteristicsTitle}
              characteristics={item.characteristics}
              flavorProfile={item.flavorProfile}
              ingredients={item.ingredients}
            />
            <ItemCellars cellars={cellars} total={cellarsTotal} />
            {config.brandsColumn === "left" && brands}
            <ItemTierLists entries={tierLists} total={tierListsTotal} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <AddReview
              itemId={item.itemId}
              type={item.type}
              myReview={item.myReview}
            />
            <ItemReviews
              reviews={item.reviews}
              itemId={item.itemId}
              type={item.type}
              endCursor={item.reviewsEndCursor}
              hasNextPage={item.reviewsHasNextPage}
            />
            {config.brandsColumn === "right" && brands}
            {config.recipes && (
              <ItemRecipes
                recipeIngredients={recipes}
                title="Used in Recipes"
                itemName={item.name}
                total={recipesTotal}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
