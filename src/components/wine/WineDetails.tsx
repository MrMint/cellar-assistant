import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatCountry,
  formatWineVariety,
} from "@cellar-assistant/shared/utility";
import { Grid, Stack } from "@mui/joy";
import { notFound } from "next/navigation";
import { isNil, nth } from "ramda";
import { ItemBrands } from "@/components/item/ItemBrands";
import { ItemCellars } from "@/components/item/ItemCellars";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeaderServer } from "@/components/item/ItemHeaderServer";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemRecipes } from "@/components/item/ItemRecipes";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { CompactRecipeRecommendations } from "@/components/recipe/RecipeRecommendations";
import { AddReview } from "@/components/review/AddReview";
import wine1 from "@/images/wine1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";
import {
  WineCellarsFragment,
  WineCoreFragment,
  type WineDetailsFragment,
  WineImagesFragment,
  WineRelationshipsFragment,
  WineReviewsFragment,
  WineUserDataFragment,
} from "./fragments";

interface WineDetailsProps {
  wine: FragmentOf<typeof WineDetailsFragment>;
  cellars: Array<{ id: string; name: string }>;
  itemId: string;
  userId?: string;
}

export function WineDetails({
  wine,
  cellars,
  itemId,
  userId,
}: WineDetailsProps) {
  if (isNil(wine)) {
    notFound();
  }

  // Read specific fragments for child components
  const coreData = readFragment(WineCoreFragment, wine);
  const imageData = readFragment(WineImagesFragment, wine);
  const userData = readFragment(WineUserDataFragment, wine);
  const reviews = readFragment(WineReviewsFragment, wine);
  const cellarItems = readFragment(WineCellarsFragment, wine);
  const relationships = readFragment(WineRelationshipsFragment, wine);

  const displayImage = nth(0, imageData.item_images ?? []);

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={itemId}
        itemName={coreData.name}
        itemType={"WINE"}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={wine1}
            />
            <ItemShare itemId={coreData.id} itemType={"WINE"} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coreData.id}
                type={"WINE"}
                favoriteId={nth(0, userData.item_favorites)?.id}
                title={coreData.name}
                subTitlePhrases={[
                  formatVintage(coreData.vintage),
                  formatWineVariety(coreData.variety),
                  formatCountry(coreData.country),
                  coreData.region,
                  formatAsPercentage(coreData.alcohol_content_percentage),
                ]}
                description={coreData.description}
              />
              <ItemCellars
                cellars={cellarItems.cellar_items.map((x) => ({
                  ...x.cellar,
                  co_owners: x.cellar.co_owners.map((y) => y.user),
                }))}
              />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview wineId={coreData.id} />
              <ItemReviews reviews={reviews.reviews} />

              {/* Brands */}
              <ItemBrands brands={relationships.brands} title="Wine Brands" />

              {/* Recipes */}
              <ItemRecipes
                recipeIngredients={relationships.recipe_ingredients}
                title="Used in Recipes"
                itemName={coreData.name}
              />

              {/* Recipe recommendations based on cellar */}
              <CompactRecipeRecommendations
                userId={userId}
                limit={3}
                orientation="vertical"
              />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
