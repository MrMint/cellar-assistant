import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatCountry,
  formatEnum,
  getIsCellarOwner,
} from "@cellar-assistant/shared/utility";
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
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import { ItemBrands } from "@/components/item/ItemBrands";
import { ItemCheckIns } from "@/components/item/ItemCheckIns";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImageWithCaptureClient } from "@/components/item/ItemImageWithCaptureClient";
import { ItemRecipes } from "@/components/item/ItemRecipes";
import { ItemRemainingSlider } from "@/components/item/ItemRemainingSlider";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import sake1 from "@/images/sake1.png";
import { parseDate } from "@/utilities";
import {
  CellarSakeDetailsFragment,
  UserWithFriendsFragment,
} from "./fragments";

interface CellarSakeDetailsProps {
  cellarItem: FragmentOf<typeof CellarSakeDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
  itemId: string;
  cellarId: string;
  userId: string;
  cellarName?: string;
  itemName?: string;
}

export function CellarSakeDetails({
  cellarItem,
  user,
  itemId,
  cellarId,
  userId,
  cellarName,
  itemName,
}: CellarSakeDetailsProps) {
  if (isNil(cellarItem) || isNil(user)) {
    notFound();
  }

  const item = readFragment(CellarSakeDetailsFragment, cellarItem);
  const userData = readFragment(UserWithFriendsFragment, user);
  const sake = item.sake;

  if (!sake) {
    notFound();
  }

  const isOwner = getIsCellarOwner(userId, item.cellar);

  const characteristics = [
    { label: "Category", value: formatEnum(sake.category) },
    { label: "Type", value: formatEnum(sake.type) },
    {
      label: "Polish Grade",
      value: sake.polish_grade ? `${sake.polish_grade}%` : undefined,
    },
    {
      label: "ABV",
      value: sake.alcohol_content_percentage
        ? `${sake.alcohol_content_percentage}%`
        : undefined,
    },
    { label: "SMV", value: sake.sake_meter_value },
    { label: "Acidity", value: sake.acidity },
    { label: "Rice Variety", value: sake.rice_variety },
    { label: "Yeast Strain", value: sake.yeast_strain },
    { label: "Serving Temp", value: formatEnum(sake.serving_temperature) },
    { label: "Vintage", value: sake.vintage },
  ].filter((char) => isNotNil(char.value) && char.value !== "");

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={"SAKE"}
        itemId={itemId}
        entityId={sake.id}
        itemName={itemName || sake.name}
        cellarId={cellarId}
        cellarName={cellarName || item.cellar?.name}
        isOwner={isOwner}
        userId={userId}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <ItemImageWithCaptureClient
            fileId={item.display_image?.file_id}
            placeholder={item.display_image?.placeholder}
            fallback={sake1}
            itemId={sake.id}
            itemType="SAKE"
            cellarItemId={itemId}
          />
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={sake.id}
                type={"SAKE"}
                favoriteId={nth(0, sake.item_favorites || [])?.id}
                title={sake.name || ""}
                subTitlePhrases={[
                  formatEnum(sake.category),
                  formatEnum(sake.type),
                  formatCountry(sake.country),
                  sake.region,
                ]}
                description={sake.description}
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
              {isNotNil(item.open_at) && (
                <ItemCheckIns
                  checkIns={item.check_ins}
                  itemId={item.id}
                  friends={userData?.friends?.map((x) => x.friend) || []}
                  user={userData}
                />
              )}
              <ItemRemainingSlider
                itemId={itemId}
                cellarId={cellarId}
                isCellarOwner={isOwner}
                percentageRemaining={item.percentage_remaining}
                opened={parseDate(item.open_at)}
                emptied={parseDate(item.empty_at)}
              />
              <ItemShare itemId={sake.id} itemType={"SAKE"} />
              {sake.brands && sake.brands.length > 0 && (
                <ItemBrands brands={sake.brands} title="Breweries" />
              )}
              {sake.recipe_ingredients &&
                sake.recipe_ingredients.length > 0 && (
                  <ItemRecipes
                    recipeIngredients={sake.recipe_ingredients}
                    itemName={sake.name}
                  />
                )}
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview sakeId={sake.id} />
              <ItemReviews reviews={sake.reviews || []} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
