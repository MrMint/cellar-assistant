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
import tea1 from "@/images/tea1.png";
import { parseDate } from "@/utilities";
import {
  CellarTeaDetailsFragment,
  UserWithFriendsFragment,
} from "./fragments";

interface CellarTeaDetailsProps {
  cellarItem: FragmentOf<typeof CellarTeaDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
  itemId: string;
  cellarId: string;
  userId: string;
  cellarName?: string;
  itemName?: string;
}

export function CellarTeaDetails({
  cellarItem,
  user,
  itemId,
  cellarId,
  userId,
  cellarName,
  itemName,
}: CellarTeaDetailsProps) {
  if (isNil(cellarItem) || isNil(user)) {
    notFound();
  }

  const item = readFragment(CellarTeaDetailsFragment, cellarItem);
  const userData = readFragment(UserWithFriendsFragment, user);
  const tea = item.tea;

  if (!tea) {
    notFound();
  }

  const isOwner = getIsCellarOwner(userId, item.cellar);

  const characteristics = [
    { label: "Category", value: formatEnum(tea.category) },
    { label: "Form", value: formatEnum(tea.form) },
    { label: "Caffeine", value: formatEnum(tea.caffeine_level) },
    { label: "Oxidation", value: formatEnum(tea.oxidation_level) },
    { label: "Processing", value: formatEnum(tea.processing) },
    { label: "Cultivar", value: tea.cultivar },
    { label: "Harvest Year", value: tea.harvest_year },
    { label: "Steep Temp", value: tea.steeping_temperature },
    { label: "Steep Time", value: tea.steeping_time },
    { label: "Organic", value: tea.is_organic ? "Yes" : undefined },
    { label: "Fair Trade", value: tea.is_fair_trade ? "Yes" : undefined },
  ].filter((char) => isNotNil(char.value) && char.value !== "");

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={"TEA"}
        itemId={itemId}
        itemName={itemName || tea.name}
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
            fallback={tea1}
            itemId={tea.id}
            itemType="TEA"
            cellarItemId={itemId}
          />
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={tea.id}
                type={"TEA"}
                favoriteId={nth(0, tea.item_favorites || [])?.id}
                title={tea.name || ""}
                subTitlePhrases={[
                  formatEnum(tea.category),
                  formatEnum(tea.form),
                  formatCountry(tea.country),
                  tea.region,
                ]}
                description={tea.description}
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
              {tea.flavor_profile && (
                <Card>
                  <CardContent>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Flavor Profile
                    </Typography>
                    <Typography>{tea.flavor_profile}</Typography>
                  </CardContent>
                </Card>
              )}
              {tea.ingredients && (
                <Card>
                  <CardContent>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Ingredients
                    </Typography>
                    <Typography>{tea.ingredients}</Typography>
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
              <ItemShare itemId={tea.id} itemType={"TEA"} />
              {tea.brands && tea.brands.length > 0 && (
                <ItemBrands brands={tea.brands} title="Brands" />
              )}
              {tea.recipe_ingredients && tea.recipe_ingredients.length > 0 && (
                <ItemRecipes
                  recipeIngredients={tea.recipe_ingredients}
                  itemName={tea.name}
                />
              )}
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview teaId={tea.id} />
              <ItemReviews reviews={tea.reviews || []} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
