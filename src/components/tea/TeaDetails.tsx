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
import tea1 from "@/images/tea1.png";
import {
  TeaCellarsFragment,
  TeaCoreFragment,
  type TeaDetailsFragment,
  TeaImagesFragment,
  TeaRelationshipsFragment,
  TeaReviewsFragment,
  TeaUserDataFragment,
} from "./fragments";

interface TeaDetailsProps {
  teaData: FragmentOf<typeof TeaDetailsFragment>;
  cellars: Array<{ id: string; name: string }>;
  itemId: string;
  userId?: string;
}

export function TeaDetails({
  teaData,
  cellars,
  itemId,
  userId,
}: TeaDetailsProps) {
  if (isNil(teaData)) {
    notFound();
  }

  const coreData = readFragment(TeaCoreFragment, teaData);
  const imageData = readFragment(TeaImagesFragment, teaData);
  const userData = readFragment(TeaUserDataFragment, teaData);
  const reviews = readFragment(TeaReviewsFragment, teaData);
  const cellarItems = readFragment(TeaCellarsFragment, teaData);
  const relationships = readFragment(TeaRelationshipsFragment, teaData);

  const displayImage = nth(0, imageData.item_images ?? []);

  const characteristics = [
    { label: "Category", value: formatEnum(coreData.category) },
    { label: "Form", value: formatEnum(coreData.form) },
    { label: "Caffeine", value: formatEnum(coreData.caffeine_level) },
    { label: "Oxidation", value: formatEnum(coreData.oxidation_level) },
    { label: "Processing", value: formatEnum(coreData.processing) },
    { label: "Cultivar", value: coreData.cultivar },
    { label: "Harvest Year", value: coreData.harvest_year },
    { label: "Steep Temp", value: coreData.steeping_temperature },
    { label: "Steep Time", value: coreData.steeping_time },
    { label: "Organic", value: coreData.is_organic ? "Yes" : undefined },
    { label: "Fair Trade", value: coreData.is_fair_trade ? "Yes" : undefined },
  ].filter((char) => isNotNil(char.value) && char.value !== "");

  return (
    <Stack spacing={2}>
      <ItemHeaderServer
        itemId={itemId}
        itemName={coreData.name}
        itemType={"TEA"}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={tea1}
            />
            <ItemShare itemId={coreData.id} itemType={"TEA"} />
          </Stack>
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coreData.id}
                type={"TEA"}
                favoriteId={nth(0, userData.item_favorites)?.id}
                title={coreData.name}
                subTitlePhrases={[
                  formatEnum(coreData.category),
                  formatEnum(coreData.form),
                  formatCountry(coreData.country),
                  coreData.region,
                ]}
                description={coreData.description}
              />
              {characteristics.length > 0 && (
                <Card>
                  <CardContent>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Tea Characteristics
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
              {coreData.flavor_profile && (
                <Card>
                  <CardContent>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Flavor Profile
                    </Typography>
                    <Typography>{coreData.flavor_profile}</Typography>
                  </CardContent>
                </Card>
              )}
              {coreData.ingredients && (
                <Card>
                  <CardContent>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Ingredients
                    </Typography>
                    <Typography>{coreData.ingredients}</Typography>
                  </CardContent>
                </Card>
              )}
              <ItemCellars
                cellars={cellarItems.cellar_items.map((x) => ({
                  ...x.cellar,
                  co_owners: x.cellar.co_owners.map((y) => y.user),
                }))}
              />
              <ItemTierLists entityId={coreData.id} entityType="tea" />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview teaId={coreData.id} />
              <ItemReviews reviews={reviews.reviews} />

              <ItemBrands brands={relationships.brands} title="Tea Brands" />

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
