import { Grid, Stack } from "@mui/joy";
import { AddReview } from "@/components/review/AddReview";
import type { ItemView } from "./adapter";
import { ItemBrands } from "./ItemBrands";
import { type ItemCellar, ItemCellars } from "./ItemCellars";
import { ItemCharacteristics } from "./ItemCharacteristics";
import ItemDetails from "./ItemDetails";
import { ItemHeaderServer } from "./ItemHeaderServer";
import { ItemImage } from "./ItemImage";
import { type ItemRecipeIngredient, ItemRecipes } from "./ItemRecipes";
import { ItemReviews } from "./ItemReviews";
import { ItemShare } from "./ItemShare";
import { type ItemTierListEntry, ItemTierLists } from "./ItemTierLists";
import { ITEM_VIEW_CONFIG } from "./itemViewConfig";

export type ItemPageViewProps = {
  item: ItemView;
  cellars: ItemCellar[];
  tierLists: ItemTierListEntry[];
  recipes: ItemRecipeIngredient[];
  /** The viewer's cellars "Add to Cellar" offers. */
  addableCellars: { id: string; name: string }[];
  editHref: string | null;
};

/**
 * The six `82450ad1:src/components/{wine,…}/{T}Details.tsx`, as one view over
 * `ITEM_VIEW_CONFIG` (inventory §5). Same grid: image and Share on the left
 * third; details, characteristics, "Located in:" and "On Lists" in the middle;
 * review form, reviews, brands and recipes on the right — with each type's
 * brands heading and column, and recipes only where the old page had them.
 */
export function ItemPageView({
  item,
  cellars,
  tierLists,
  recipes,
  addableCellars,
  editHref,
}: ItemPageViewProps) {
  const config = ITEM_VIEW_CONFIG[item.type];
  const brands = <ItemBrands brands={item.brands} title={config.brandTitle} />;

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={item.itemId}
        itemName={item.name}
        itemType={item.type}
        cellars={addableCellars}
        editHref={editHref}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              url={item.image?.url}
              placeholder={item.image?.placeholder}
              fallback={config.fallback}
            />
            <ItemShare itemId={item.itemId} itemType={item.type} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
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
              <ItemCellars cellars={cellars} />
              {config.brandsColumn === "left" && brands}
              <ItemTierLists entries={tierLists} />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
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
                />
              )}
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
