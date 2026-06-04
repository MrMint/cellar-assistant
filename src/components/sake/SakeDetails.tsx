import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { formatCountry, formatEnum } from "@cellar-assistant/shared/utility";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { ItemBrands } from "@/components/item/ItemBrands";
import { ItemCellars } from "@/components/item/ItemCellars";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeaderServer } from "@/components/item/ItemHeaderServer";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemRecipes } from "@/components/item/ItemRecipes";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { ItemTierLists } from "@/components/item/ItemTierLists";
import { CompactRecipeRecommendations } from "@/components/recipe/RecipeRecommendations";
import { AddReview } from "@/components/review/AddReview";
import sake1 from "@/images/sake1.png";
import {
  SakeCellarsFragment,
  SakeCoreFragment,
  type SakeDetailsFragment,
  SakeImagesFragment,
  SakeRelationshipsFragment,
  SakeReviewsFragment,
  SakeUserDataFragment,
} from "./fragments";

interface SakeDetailsProps {
  sakeData: FragmentOf<typeof SakeDetailsFragment>;
  cellars: Array<{ id: string; name: string }>;
  itemId: string;
  userId?: string;
}

export function SakeDetails({
  sakeData,
  cellars,
  itemId,
  userId,
}: SakeDetailsProps) {
  if (isNil(sakeData)) {
    notFound();
  }

  const coreData = readFragment(SakeCoreFragment, sakeData);
  const imageData = readFragment(SakeImagesFragment, sakeData);
  const userData = readFragment(SakeUserDataFragment, sakeData);
  const reviews = readFragment(SakeReviewsFragment, sakeData);
  const cellarItems = readFragment(SakeCellarsFragment, sakeData);
  const relationships = readFragment(SakeRelationshipsFragment, sakeData);

  const displayImage = nth(0, imageData.item_images ?? []);

  const characteristics = [
    { label: "Category", value: formatEnum(coreData.category) },
    { label: "Type", value: formatEnum(coreData.type) },
    {
      label: "Polish Grade",
      value: coreData.polish_grade ? `${coreData.polish_grade}%` : undefined,
    },
    {
      label: "ABV",
      value: coreData.alcohol_content_percentage
        ? `${coreData.alcohol_content_percentage}%`
        : undefined,
    },
    { label: "SMV", value: coreData.sake_meter_value },
    { label: "Acidity", value: coreData.acidity },
    { label: "Rice Variety", value: coreData.rice_variety },
    { label: "Yeast Strain", value: coreData.yeast_strain },
    { label: "Serving Temp", value: formatEnum(coreData.serving_temperature) },
    { label: "Vintage", value: coreData.vintage },
  ].filter((char) => isNotNil(char.value) && char.value !== "");

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={itemId}
        itemName={coreData.name}
        itemType={"SAKE"}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={sake1}
            />
            <ItemShare itemId={coreData.id} itemType={"SAKE"} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coreData.id}
                type={"SAKE"}
                favoriteId={nth(0, userData.item_favorites)?.id}
                title={coreData.name}
                subTitlePhrases={[
                  formatEnum(coreData.category),
                  formatEnum(coreData.type),
                  formatCountry(coreData.country),
                  coreData.region,
                ]}
                description={coreData.description}
              />
              {characteristics.length > 0 && (
                <Card>
                  <CardContent>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Sake Characteristics
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {characteristics.map((char) => (
                        <Chip key={char.label} variant="outlined">
                          {char.label}: {char.value}
                        </Chip>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
              <ItemCellars
                cellars={cellarItems.cellar_items.map((x) => ({
                  ...x.cellar,
                  co_owners: x.cellar.co_owners.map((y) => y.user),
                }))}
              />
              <ItemTierLists entityId={coreData.id} entityType="sake" />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview sakeId={coreData.id} />
              <ItemReviews reviews={reviews.reviews} />

              <ItemBrands brands={relationships.brands} title="Breweries" />

              <ItemRecipes
                recipeIngredients={relationships.recipe_ingredients}
                title="Used in Recipes"
                itemName={coreData.name}
              />

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
