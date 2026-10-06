import { Grid, Stack } from "@mui/joy";
import { AddReview } from "@/components/review/AddReview";
import type { CheckInRow, ItemView } from "./adapter";
import { CellarItemHeader } from "./CellarItemHeader";
import { ItemBrands } from "./ItemBrands";
import type { ItemCellarUser } from "./ItemCellars";
import { ItemCharacteristics } from "./ItemCharacteristics";
import { ItemCheckIns } from "./ItemCheckIns";
import ItemDetails from "./ItemDetails";
import { ItemImageWithCaptureClient } from "./ItemImageWithCaptureClient";
import { type ItemRecipeIngredient, ItemRecipes } from "./ItemRecipes";
import { ItemRemainingSlider } from "./ItemRemainingSlider";
import { ItemReviews } from "./ItemReviews";
import { ItemShare } from "./ItemShare";
import { ITEM_VIEW_CONFIG } from "./itemViewConfig";

export type CellarItemPageViewProps = {
  item: ItemView;
  recipes: ItemRecipeIngredient[];
  bottle: {
    id: string;
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
    displayImage: { url: string; placeholder: string | null } | null;
  };
  cellar: { id: string; name: string };
  checkIns: CheckInRow[];
  /** `checkIns.totalCount` — the API returns the newest 100. */
  checkInsTotal?: number | null;
  /** `recipeIngredients.totalCount` — the API returns 100. */
  recipesTotal?: number | null;
  viewer: ItemCellarUser;
  friends: ItemCellarUser[];
  isOwner: boolean;
  editHref: string | null;
};

/**
 * The six `82450ad1:src/components/{wine,…}/Cellar{T}Details.tsx`, as one view
 * over `ITEM_VIEW_CONFIG` — one **bottle** (decision 1). Same grid: the
 * bottle's display photo (tap to set one) on the left; details,
 * characteristics, check-ins (once opened), the remaining slider, Share,
 * brands (wine, coffee, sake, tea) and, for sake and tea, recipes in the
 * middle; the review form and reviews on the right, then beer's and spirit's
 * brands (`cellarBrandsColumn`).
 */
export function CellarItemPageView({
  item,
  recipes,
  bottle,
  cellar,
  checkIns,
  checkInsTotal,
  recipesTotal,
  viewer,
  friends,
  isOwner,
  editHref,
}: CellarItemPageViewProps) {
  const config = ITEM_VIEW_CONFIG[item.type];
  const brands = (
    <ItemBrands brands={item.brands} title={config.cellarBrandTitle} />
  );

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={item.type}
        itemId={bottle.id}
        entityId={item.itemId}
        itemName={item.name}
        cellarId={cellar.id}
        cellarName={cellar.name}
        isOwner={isOwner}
        editHref={editHref}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <ItemImageWithCaptureClient
            url={bottle.displayImage?.url}
            placeholder={bottle.displayImage?.placeholder}
            fallback={config.fallback}
            itemId={item.itemId}
            itemType={item.type}
            cellarId={cellar.id}
            cellarItemId={bottle.id}
          />
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
              {bottle.openAt !== null && (
                <ItemCheckIns
                  checkIns={checkIns}
                  itemId={bottle.id}
                  cellarId={cellar.id}
                  friends={friends}
                  user={viewer}
                  total={checkInsTotal}
                />
              )}
              <ItemRemainingSlider
                itemId={bottle.id}
                cellarId={cellar.id}
                isCellarOwner={isOwner}
                percentageRemaining={bottle.percentageRemaining}
                opened={bottle.openAt}
                emptied={bottle.emptyAt}
              />
              <ItemShare itemId={item.itemId} itemType={item.type} />
              {config.cellarBrandsColumn === "left" && brands}
              {config.cellarRecipes && (
                <ItemRecipes
                  recipeIngredients={recipes}
                  title="Used in Recipes"
                  itemName={item.name}
                  total={recipesTotal}
                />
              )}
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
              {config.cellarBrandsColumn === "right" && brands}
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
