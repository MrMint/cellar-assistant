import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import {
  formatCountry,
  formatEnum,
  getIsCellarOwner,
} from "@cellar-assistant/shared/utility";
import { Grid, Stack } from "@mui/joy";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import { ItemCheckIns } from "@/components/item/ItemCheckIns";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImageWithCaptureClient } from "@/components/item/ItemImageWithCaptureClient";
import { ItemRemainingSlider } from "@/components/item/ItemRemainingSlider";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import coffee1 from "@/images/coffee1.png";
import { parseDate } from "@/utilities";
import {
  CellarCoffeeCheckInsFragment,
  CellarCoffeeDataFragment,
  type CellarCoffeeDetailsFragment,
  CellarCoffeeItemFragment,
  CoffeeCoreFragment,
  CoffeeReviewsFragment,
  CoffeeUserDataFragment,
  UserWithFriendsFragment,
} from "./fragments";

interface CellarCoffeeDetailsProps {
  cellarItem: FragmentOf<typeof CellarCoffeeDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
  itemId: string;
  cellarId: string;
  userId: string;
  cellarName?: string;
  itemName?: string;
}

export function CellarCoffeeDetails({
  cellarItem,
  user,
  itemId,
  cellarId,
  userId,
  cellarName,
  itemName,
}: CellarCoffeeDetailsProps) {
  if (isNil(cellarItem) || isNil(user)) {
    notFound();
  }

  // Read specific fragments for child components
  const itemData = readFragment(CellarCoffeeItemFragment, cellarItem);
  const coffeeData = readFragment(CellarCoffeeDataFragment, cellarItem);
  const checkInsData = readFragment(CellarCoffeeCheckInsFragment, cellarItem);
  const userData = readFragment(UserWithFriendsFragment, user);

  // Read coffee-specific fragments
  const coffeeCore = readFragment(CoffeeCoreFragment, coffeeData.coffee);
  const coffeeUserData = readFragment(
    CoffeeUserDataFragment,
    coffeeData.coffee,
  );
  const coffeeReviews = readFragment(CoffeeReviewsFragment, coffeeData.coffee);

  // Null safety checks
  if (!coffeeCore || !coffeeUserData || !coffeeReviews) {
    notFound();
  }

  const isOwner = getIsCellarOwner(userId, itemData.cellar);

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={"COFFEE"}
        itemId={itemId}
        itemName={itemName || coffeeCore?.name}
        cellarId={cellarId}
        cellarName={cellarName || itemData.cellar?.name}
        isOwner={isOwner}
        userId={userId}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <ItemImageWithCaptureClient
            fileId={itemData.display_image?.file_id}
            placeholder={itemData.display_image?.placeholder}
            fallback={coffee1}
            itemId={coffeeCore?.id}
            itemType="COFFEE"
            cellarItemId={itemId}
          />
        </Grid>
        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <ItemDetails
                itemId={coffeeCore?.id}
                type={"COFFEE"}
                favoriteId={nth(0, coffeeUserData?.item_favorites || [])?.id}
                title={coffeeCore?.name || ""}
                subTitlePhrases={[
                  formatEnum(coffeeCore?.roast_level),
                  formatCountry(coffeeCore?.country),
                  formatEnum(coffeeCore?.species),
                  formatEnum(coffeeCore?.cultivar),
                ]}
                description={coffeeCore?.description}
              />
              {isNotNil(itemData.open_at) && (
                <ItemCheckIns
                  checkIns={checkInsData.check_ins}
                  itemId={itemData?.id}
                  friends={userData?.friends?.map((x) => x.friend) || []}
                  user={userData}
                />
              )}
              <ItemRemainingSlider
                itemId={itemId}
                isCellarOwner={isOwner}
                percentageRemaining={itemData.percentage_remaining}
                opened={parseDate(itemData?.open_at)}
                emptied={parseDate(itemData?.empty_at)}
              />
              <ItemShare itemId={coffeeCore?.id} itemType={"COFFEE"} />
            </Stack>
          </Grid>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <AddReview coffeeId={coffeeCore?.id} />
              <ItemReviews reviews={coffeeReviews?.reviews || []} />
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
