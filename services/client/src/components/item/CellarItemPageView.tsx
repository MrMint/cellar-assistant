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
  /** The viewer's friends — "Who with" in the log sheet, preloaded. */
  friends: ItemCellarUser[];
  isOwner: boolean;
  editHref: string | null;
};

/**
 * The six `82450ad1:src/components/{wine,…}/Cellar{T}Details.tsx`, as one view
 * over `ITEM_VIEW_CONFIG` — one **bottle** (decision 1). Same grid: the
 * bottle's display photo (tap to set one) on the left; details,
 * characteristics, check-ins (once opened), the remaining slider, brands
 * (wine, coffee, sake, tea) and, for sake and tea, recipes in the middle
 * (Share, which sat under the slider, is the header bar's action now —
 * N26); the review form and reviews on the right, then beer's and spirit's
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
  friends,
  isOwner,
  editHref,
}: CellarItemPageViewProps) {
  const config = ITEM_VIEW_CONFIG[item.type];
  const brands = (
    <ItemBrands brands={item.brands} title={config.cellarBrandTitle} />
  );

  return (
    <div className="flex flex-col gap-4">
      <CellarItemHeader
        itemType={item.type}
        itemId={bottle.id}
        entityId={item.itemId}
        itemName={item.name}
        cellarId={cellar.id}
        cellarName={cellar.name}
        isOwner={isOwner}
        editHref={editHref}
        checkInCount={checkInsTotal ?? checkIns.length}
        bottle={{
          openAt: bottle.openAt,
          emptyAt: bottle.emptyAt,
          percentageRemaining: bottle.percentageRemaining,
        }}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <ItemImageWithCaptureClient
            url={bottle.displayImage?.url}
            placeholder={bottle.displayImage?.placeholder}
            fallback={config.fallback}
            itemId={item.itemId}
            itemType={item.type}
            cellarId={cellar.id}
            cellarItemId={bottle.id}
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
            {bottle.openAt !== null && (
              <ItemCheckIns
                checkIns={checkIns}
                subject={{
                  itemType: item.type,
                  itemId: item.itemId,
                  itemName: item.name,
                  bottle: { cellarId: cellar.id, cellarItemId: bottle.id },
                }}
                friends={friends}
                total={checkInsTotal}
                finished={bottle.emptyAt !== null}
              />
            )}
            <ItemRemainingSlider
              itemId={bottle.id}
              cellarId={cellar.id}
              isCellarOwner={isOwner}
              percentageRemaining={bottle.percentageRemaining}
              opened={bottle.openAt}
              emptied={bottle.emptyAt}
              itemName={item.name}
            />
            {config.cellarBrandsColumn === "left" && brands}
            {config.cellarRecipes && (
              <ItemRecipes
                recipeIngredients={recipes}
                title="Used in Recipes"
                itemName={item.name}
                total={recipesTotal}
              />
            )}
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
            {config.cellarBrandsColumn === "right" && brands}
          </div>
        </div>
      </div>
    </div>
  );
}
